import assert from 'node:assert/strict';
import {processOneMcp} from '../src/mcp-worker';
import {LadderPlayer} from '../src/ladder-match';

void (async()=>{
  let finished:{accepted:boolean;error:string|null}|null=null,closed=0;
  const task={submissionId:'submission',playerId:'player',endpoint:'https://example.com/mcp'};
  const store={async claimMcp(){return task;},async finishMcp(_id:string,_token:string,accepted:boolean,error:string|null){finished={accepted,error};return true;}};
  const player:LadderPlayer={async choose(){return {};}};
  const connect=()=>({...player,async connect(){},async close(){closed++;}});
  assert.equal(await processOneMcp(store,connect,async()=>{}),true);
  assert.deepEqual(finished,{accepted:true,error:null});assert.equal(closed,1);
  assert.equal(await processOneMcp(store,connect,async()=>{throw Error('private data');}),true);
  assert.equal((finished as unknown as {accepted:boolean}).accepted,false);
  assert.ok(!(finished as unknown as {error:string}).error.includes('private data'));
  assert.equal(closed,2);
  assert.equal(await processOneMcp({...store,async claimMcp(){return null;}},connect,async()=>{}),false);
})().catch(error=>{console.error(error);process.exitCode=1;});
