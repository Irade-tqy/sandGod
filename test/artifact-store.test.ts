import assert from 'node:assert/strict';
import {mkdtemp,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ArtifactStore} from '../src/artifact-store';

void (async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'sandgod-artifacts-'));
  const store=new ArtifactStore(root),id='00000000-0000-0000-0000-000000000001',wasm=Buffer.from([0,97,115,109,1,0,0,0]);
  const hash=await store.save(id,wasm);
  assert.deepEqual(await store.read(id,hash),wasm);
  assert.equal(await store.save(id,wasm),hash);
  await assert.rejects(store.read(id,'0'.repeat(64)));
  await assert.rejects(store.save('../escape',wasm));
  const other='00000000-0000-0000-0000-000000000002';
  await symlink(path.join(root,id+'.wasm'),path.join(root,other+'.wasm'));
  await assert.rejects(store.read(other,hash));
})().catch(error=>{console.error(error);process.exitCode=1;});
