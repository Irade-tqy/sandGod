import assert from 'node:assert/strict';
import {LadderStore} from '../src/ladder-store';

void (async()=>{
  const original=globalThis.fetch,id='00000000-0000-0000-0000-000000000001';
  let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;
    assert.ok(String(input).startsWith('https://icmudmlyhkxmiyeqwuvi.supabase.co/rest/v1/'));
    assert.equal(init?.redirect,'error');
    return new Response(JSON.stringify(init?.method==='PATCH'?[{id}]:[{id,endpoint:'https://example.com/mcp'}]),{status:200});
  };
  try{
    const store=new LadderStore('test-only');
    assert.equal(await store.getActiveMcp('invalid'),null);
    assert.equal(calls,0);
    assert.deepEqual(await store.getActiveMcp(id),{id,endpoint:'https://example.com/mcp'});
    await store.setMcpStatus(id,'offline');
    assert.equal(calls,2);
  }finally{globalThis.fetch=original;}
})().catch(error=>{console.error(error);process.exitCode=1;});
