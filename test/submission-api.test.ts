import assert from 'node:assert/strict';
import express from 'express';
import {submissionApi} from '../src/submission-api';
import {createHash} from 'node:crypto';

void (async()=>{
  const owner='00000000-0000-0000-0000-000000000001',id='00000000-0000-0000-0000-000000000002';
  let saved:string|undefined;
  const store={async enqueueMcp(user:string,_name:string,_author:string,url:string){assert.equal(user,owner);saved=url;return id;},async getSubmission(candidate:string,user:string){return candidate===id&&user===owner?{id,state:'pending'}:null;}};
  const code=Buffer.from('int main(){}'),hash=createHash('sha256').update(code).digest('hex');let uploaded=false,published=false,cancelled=false;
  const source={async reserveSource(user:string,_name:string,_author:string,kind:'c'|'cpp',sha:string,size:number){assert.equal(user,owner);assert.equal(kind,'c');assert.equal(sha,hash);assert.equal(size,code.length);return {id,path:'private'};},async sourceStaging(candidate:string,user:string){return candidate===id&&user===owner?{id,path:'private',sha256:hash,size:code.length,kind:'c' as const}:null;},async publishSource(){published=true;return true;},async cancelSource(){cancelled=true;return true;},async upload(path:string,data:Uint8Array){assert.equal(path,'private');assert.deepEqual(Buffer.from(data),code);uploaded=true;}};
  const app=express();app.use('/api',submissionApi(store,async token=>token==='Bearer valid'?owner:null,'https://site.example',source));
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
    const reservation=await fetch(base+'/submissions/source',{method:'POST',headers,body:JSON.stringify({name:'A',author:'B',filename:'策略.c',sha256:hash,size:code.length})});
    assert.equal(reservation.status,202);assert.deepEqual(await reservation.json(),{id});
    const upload=await fetch(base+'/submissions/source/'+id,{method:'PUT',headers:{...headers,'Content-Type':'application/octet-stream'},body:code});
    assert.equal(upload.status,202);assert.deepEqual(await upload.json(),{id});assert.ok(uploaded&&published);
    uploaded=false;
    const mismatch=await fetch(base+'/submissions/source/'+id,{method:'PUT',headers:{...headers,'Content-Type':'application/octet-stream'},body:Buffer.from('wrong')});
    assert.equal(mismatch.status,400);assert.ok(cancelled&&!uploaded);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
})().catch(error=>{console.error(error);process.exitCode=1;});
