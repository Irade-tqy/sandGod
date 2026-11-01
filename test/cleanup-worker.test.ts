import assert from 'node:assert/strict';
import {processOneCleanup} from '../src/cleanup-worker';

void (async()=>{
  let deleted:boolean|undefined;
  const task={id:'job',path:'pending/example'};
  const store={async claimCleanup(){return task;},async finishCleanup(_id:string,_token:string,value:boolean){deleted=value;return true;}};
  assert.equal(await processOneCleanup(store,{async remove(path){assert.equal(path,task.path);}}),true);
  assert.equal(deleted,true);
  await processOneCleanup(store,{async remove(){throw Error('unavailable');}});
  assert.equal(deleted,false);
  assert.equal(await processOneCleanup({...store,async claimCleanup(){return null;}},{async remove(){}}),false);
})().catch(error=>{console.error(error);process.exitCode=1;});
