import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {challengeLadder} from './challenge';
import {LadderStore} from './ladder-store';
import {McpOpponent} from './mcp-opponent';
import {Player} from './game';

const secret=process.env.SANDGOD_SUPABASE_SECRET_KEY;
if(!secret)throw Error('天梯服务未配置数据库密钥');
const allowedOrigin='https://irade-tqy.github.io';
const clientErrors=new Set(['请先结束当前对局','对局设置无效','请等待对局准备完成','请选择起始位置','行动无效','未知操作','天梯选手不可用','MCP 选手离线或不可用','天梯数据库暂时不可用','玩家位置无效','四个方向概率必须是至少 1% 的整数，总和为 100%。','请选择起始行上的位置。','这个行动不可用','对局已关闭']);
const app=express(), server=createServer(app), store=new LadderStore(secret);
const io=new Server(server,{maxHttpBufferSize:32768,cors:{origin:allowedOrigin},allowRequest:(request,callback)=>callback(null,request.headers.origin===allowedOrigin)});
const connections=new Map<string,number>();
io.use((socket,next)=>{
  const ip=socket.request.socket.remoteAddress??'';
  const total=[...connections.values()].reduce((a,b)=>a+b,0),perIp=connections.get(ip)??0;
  if(!ip||total>=50||perIp>=5)return next(Error('连接已满，请稍后重试'));
  connections.set(ip,perIp+1);
  socket.once('disconnect',()=>{const n=connections.get(ip)??0;if(n<=1)connections.delete(ip);else connections.set(ip,n-1);});
  next();
});
io.on('connection',socket=>{
  let session:Awaited<ReturnType<typeof challengeLadder>>|undefined, busy=false, count=0, period=Date.now();
  socket.on('command',async(message:unknown,reply:unknown)=>{
    if(typeof reply!=='function')return;
    const respond=reply as (value:{ok?:boolean;error?:string})=>void;
    if(Date.now()-period>60000){count=0;period=Date.now();}
    if(++count>120)return respond({error:'操作过于频繁，请稍后重试'});
    if(!message||typeof message!=='object'||Array.isArray(message))return respond({error:'请求无效'});
    const input=message as {kind?:unknown;human?:unknown;weights?:unknown;entryId?:unknown;col?:unknown;action?:unknown;manual?:unknown};
    try{
      if(input.kind==='ladder-new'){
        if(busy||session)throw Error('请先结束当前对局');
        if((input.human!==0&&input.human!==1)||!Array.isArray(input.weights)||typeof input.entryId!=='string')throw Error('对局设置无效');
        busy=true;
        try{
          const created=await challengeLadder(input.entryId,input.human as Player,input.weights,store,endpoint=>new McpOpponent(endpoint),state=>socket.emit('state',{mode:'solo',state}),()=>socket.emit('game-error','天梯选手暂时不可用。'));
          if(!socket.connected){await created.close();return;}
          session=created;
        }finally{busy=false;}
      }else if(input.kind==='ladder-close'){
        if(busy)throw Error('请等待对局准备完成');
        const previous=session;session=undefined;await previous?.close();
      }else if(input.kind==='game-choose'){
        if(!session||typeof input.col!=='number')throw Error('请选择起始位置');
        session.game.choose(input.col);
      }else if(input.kind==='game-action'){
        if(!session||typeof input.action!=='number')throw Error('行动无效');
        session.game.action(input.action,input.manual===true);
      }else throw Error('未知操作');
      respond({ok:true});
    }catch(error){const message=error instanceof Error?error.message:'';respond({error:clientErrors.has(message)?message:'操作失败，请稍后重试'});}
  });
  socket.on('disconnect',()=>{void session?.close();session=undefined;});
});
server.listen(Number(process.env.PORT||3001),'127.0.0.1',()=>console.log('天梯对局服务已启动'));
