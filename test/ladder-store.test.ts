import assert from 'node:assert/strict';
import {LadderStore} from '../src/ladder-store';

void (async()=>{
  const original=globalThis.fetch,id='00000000-0000-0000-0000-000000000001';
  let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;
    assert.ok(String(input).startsWith('https://icmudmlyhkxmiyeqwuvi.supabase.co/rest/v1/'));
    assert.equal(init?.redirect,'error');
    assert.equal(new Headers(init?.headers).has('authorization'),false);
    assert.equal(new Headers(init?.headers).get('apikey'),'test-only');
    const row=String(input).includes('arena_submission_status')?{id,state:'pending',endpoint:'private',owner_id:'private'}:{id,endpoint:'https://example.com/mcp'};
    return new Response(JSON.stringify(init?.method==='PATCH'?[{id}]:[row]),{status:200});
  };
  try{
    const store=new LadderStore('test-only');
    assert.equal(await store.getActiveMcp('invalid'),null);
    assert.equal(calls,0);
    assert.deepEqual(await store.getActiveMcp(id),{id,endpoint:'https://example.com/mcp'});
    await store.setMcpStatus(id,'offline');
    assert.equal(calls,2);
    await assert.rejects(store.recordMatch(id,id,id,id));
    assert.equal(calls,2);
    const other='00000000-0000-0000-0000-000000000002';
    await store.recordMatch(id,id,other,id);
    assert.equal(calls,3);
    const status=await store.getSubmission(id,id);
    assert.ok(status && !('endpoint' in status) && !('owner_id' in status));
  }finally{globalThis.fetch=original;}
})().catch(error=>{console.error(error);process.exitCode=1;});
