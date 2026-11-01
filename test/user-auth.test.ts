import assert from 'node:assert/strict';
import {verifiedUser} from '../src/user-auth';

void (async()=>{
  const original=globalThis.fetch,id='00000000-0000-0000-0000-000000000001';let requests=0;
  globalThis.fetch=async(_input,init)=>{requests++;assert.equal(init?.redirect,'error');return new Response(JSON.stringify({id,is_anonymous:false}),{status:200});};
  try{
    assert.equal(await verifiedUser('Bearer invalid','test-only'),null);assert.equal(requests,0);
    assert.equal(await verifiedUser('Bearer aaa.bbb.ccc','test-only'),id);assert.equal(requests,1);
  }finally{globalThis.fetch=original;}
})().catch(error=>{console.error(error);process.exitCode=1;});
