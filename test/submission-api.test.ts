import assert from 'node:assert/strict';
import express from 'express';
import {submissionApi} from '../src/submission-api';

void (async()=>{
  const owner='00000000-0000-0000-0000-000000000001',id='00000000-0000-0000-0000-000000000002';
  let saved:string|undefined;
  const store={async enqueueMcp(user:string,_name:string,_author:string,url:string){assert.equal(user,owner);saved=url;return id;},async getSubmission(candidate:string,user:string){return candidate===id&&user===owner?{id,state:'pending'}:null;}};
  const app=express();app.use('/api',submissionApi(store,async token=>token==='Bearer valid'?owner:null,'https://site.example'));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('测试端口无效');
  const base='http://127.0.0.1:'+address.port+'/api',headers={Origin:'https://site.example',Authorization:'Bearer valid','Content-Type':'application/json'};
  try{
    const send=(value:unknown,overrides:Record<string,string>={})=>fetch(base+'/submissions/mcp',{method:'POST',headers:{...headers,...overrides},body:JSON.stringify(value)});
    assert.equal((await send({name:'A',author:'B',endpoint:'https://example.com/mcp'},{Origin:'https://evil.example'})).status,403);
    assert.equal((await send({name:'A',author:'B',endpoint:'https://example.com/mcp'},{Authorization:'Bearer invalid'})).status,401);
    assert.equal((await send({name:'A',author:'B',endpoint:'https://127.0.0.1/mcp'})).status,400);
    const accepted=await send({name:'A',author:'B',endpoint:'https://example.com/mcp'});
    assert.equal(accepted.status,202);assert.deepEqual(await accepted.json(),{id});assert.equal(saved,'https://example.com/mcp');
    const status=await fetch(base+'/submissions/'+id,{headers});assert.deepEqual(await status.json(),{id,state:'pending'});
    assert.equal((await fetch(base+'/submissions/'+id,{headers:{...headers,Authorization:'Bearer invalid'}})).status,401);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
})().catch(error=>{console.error(error);process.exitCode=1;});
