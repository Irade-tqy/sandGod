import assert from 'node:assert/strict';
import {createPublicFetch,limitResponse} from '../src/public-fetch';

void (async()=>{
  const connection=createPublicFetch('https://localhost/mcp');
  try {
    await assert.rejects(connection.fetch('https://127.0.0.1/mcp'));
    await assert.rejects(connection.fetch('https://localhost/mcp'));
    await assert.rejects(connection.fetch('https://example.com/mcp'));
    assert.equal(await limitResponse(new Response('ok')).text(),'ok');
    await assert.rejects(limitResponse(new Response(new Uint8Array(1024*1024+1))).arrayBuffer(),/超过 1 MiB/);
  } finally { await connection.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
