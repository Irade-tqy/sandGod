import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {io} from 'socket.io-client';

void (async()=>{
  const server=spawn(process.execPath,[path.join(__dirname,'../src/server.js')],{env:{PATH:process.env.PATH,PORT:'31997',SANDGOD_SUPABASE_SECRET_KEY:'test-only'},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise<void>((resolve,reject)=>{server.stdout.once('data',()=>resolve());server.once('error',reject);server.once('exit',()=>reject(Error('测试服务未启动')));});
    const client=io('http://127.0.0.1:31997',{extraHeaders:{Origin:'https://irade-tqy.github.io'},transports:['websocket'],reconnection:false,timeout:3000});
    await new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('connect_error',reject);});
    const response=await new Promise<{error?:string}>(resolve=>client.emit('command',{kind:'ladder-new',human:0,weights:[25,25,25,25],entryId:'bad'},resolve));
    assert.equal(response.error,'天梯选手不可用');
    client.disconnect();
    const denied=io('http://127.0.0.1:31997',{extraHeaders:{Origin:'https://malicious.example'},transports:['websocket'],reconnection:false,timeout:3000});
    await new Promise<void>((resolve,reject)=>{denied.once('connect',()=>reject(Error('不应允许其他来源')));denied.once('connect_error',()=>resolve());});
    denied.disconnect();
  }finally{server.kill('SIGTERM');}
})().catch(error=>{console.error(error);process.exitCode=1;});
