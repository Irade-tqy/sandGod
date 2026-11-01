import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {io} from 'socket.io-client';

void (async()=>{
  const server=spawn(process.execPath,[path.join(__dirname,'../src/server.js')],{env:{PATH:process.env.PATH,PORT:'31997',SANDGOD_SUPABASE_SECRET_KEY:'test-only'},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise<void>((resolve,reject)=>{server.stdout.once('data',()=>resolve());server.once('error',reject);server.once('exit',()=>reject(Error('测试服务未启动')));});
    assert.deepEqual(await (await fetch('http://127.0.0.1:31997/healthz')).json(),{ok:true});
    const client=io('http://127.0.0.1:31997',{extraHeaders:{Origin:'https://irade-tqy.github.io'},transports:['websocket'],reconnection:false,timeout:3000});
    await new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('connect_error',reject);});
    const response=await new Promise<{error?:string}>(resolve=>client.emit('command',{kind:'ladder-new',human:0,weights:[25,25,25,25],entryId:'bad'},resolve));
    assert.equal(response.error,'天梯选手不可用');
    client.disconnect();
    const denied=io('http://127.0.0.1:31997',{extraHeaders:{Origin:'https://malicious.example'},transports:['websocket'],reconnection:false,timeout:3000});
    await new Promise<void>((resolve,reject)=>{denied.once('connect',()=>reject(Error('不应允许其他来源')));denied.once('connect_error',()=>resolve());});
    denied.disconnect();
    for(const origin of ['http://localhost:3000','http://192.168.1.20:3000']){
      const local=io('http://127.0.0.1:31997',{extraHeaders:{Origin:origin},transports:['websocket'],reconnection:false,timeout:3000});
      await new Promise<void>((resolve,reject)=>{local.once('connect',()=>resolve());local.once('connect_error',reject);});local.disconnect();
    }
    const clients=Array.from({length:5},()=>io('http://127.0.0.1:31997',{extraHeaders:{Origin:'https://irade-tqy.github.io','X-Forwarded-For':'203.0.113.10'},transports:['websocket'],reconnection:false,timeout:3000}));
    await Promise.all(clients.map(socket=>new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('connect_error',reject);})));
    const excess=io('http://127.0.0.1:31997',{extraHeaders:{Origin:'https://irade-tqy.github.io','X-Forwarded-For':'203.0.113.10'},transports:['websocket'],reconnection:false,timeout:3000});
    await new Promise<void>((resolve,reject)=>{excess.once('connect',()=>reject(Error('同一地址超过连接上限')));excess.once('connect_error',()=>resolve());});
    const other=io('http://127.0.0.1:31997',{extraHeaders:{Origin:'https://irade-tqy.github.io','X-Forwarded-For':'203.0.113.11'},transports:['websocket'],reconnection:false,timeout:3000});
    await new Promise<void>((resolve,reject)=>{other.once('connect',()=>resolve());other.once('connect_error',reject);});
    clients.forEach(socket=>socket.disconnect());excess.disconnect();other.disconnect();
  }finally{server.kill('SIGTERM');}
})().catch(error=>{console.error(error);process.exitCode=1;});
