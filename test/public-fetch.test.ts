import assert from 'node:assert/strict';
import {createPublicFetch,createSafeLookup,limitResponse,resolvePublicDns} from '../src/public-fetch';

void (async()=>{
  const mixed=createSafeLookup((_host,cb)=>cb(null,[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]));
  mixed('example.com',{},error=>assert.ok(error));
  const external=createSafeLookup((_host,cb)=>cb(null,[{address:'8.8.8.8',family:4}]));
  external('example.com',{},(error,address)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');});
  const fake:typeof fetch=async input=>new Response(JSON.stringify({Status:0,Answer:[{type:new URL(String(input)).searchParams.get('type')==='1'?1:28,data:new URL(String(input)).searchParams.get('type')==='1'?'8.8.8.8':'2606:4700:4700::1111'}]}));
  assert.deepEqual(await resolvePublicDns('example.com',fake),[{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}]);
  const connection=createPublicFetch('https://example.com/mcp');
  try {
    await assert.rejects(connection.fetch('https://127.0.0.1/mcp'));
    await assert.rejects(connection.fetch('https://localhost/mcp'));
    await assert.rejects(connection.fetch('https://other.example/mcp'));
    assert.equal(await limitResponse(new Response('ok')).text(),'ok');
    await assert.rejects(limitResponse(new Response(new Uint8Array(1024*1024+1))).arrayBuffer(),/超过 1 MiB/);
  } finally { await connection.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
