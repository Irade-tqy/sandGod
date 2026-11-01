import assert from 'node:assert/strict';
import {SourceStorage} from '../src/source-storage';

void (async()=>{
  const original=globalThis.fetch,path='pending/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.c';let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;assert.equal(new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url).origin,'https://icmudmlyhkxmiyeqwuvi.supabase.co');
    assert.equal(init?.redirect,'error');
    assert.equal(new Headers(init?.headers).get('apikey'),'sb_secret_test');
    assert.equal(new Headers(init?.headers).has('authorization'),false);
    if(init?.method==='POST')return new Response(JSON.stringify({Key:path}),{status:200,headers:{'Content-Type':'application/json'}});
    if(init?.method==='DELETE')return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
    return new Response('source',{status:200});
  };
  try{
    const storage=new SourceStorage('sb_secret_test');
    await storage.upload(path,Buffer.from('source'));
    assert.equal((await storage.download(path)).toString(),'source');
    await storage.remove(path);
    assert.equal(calls,3);
    await assert.rejects(storage.remove('../escape'));
    assert.equal(calls,3);
  }finally{globalThis.fetch=original;}
})().catch(error=>{console.error(error);process.exitCode=1;});
