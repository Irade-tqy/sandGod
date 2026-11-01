import assert from 'node:assert/strict';
import {processOneRating} from '../src/rating-worker';
import {LadderPlayer} from '../src/ladder-match';

void (async()=>{
  let result:{winner:string|null;completed:boolean}|null=null,closed=0;
  const task={jobId:'job',first:'a',second:'b'};
  const store={async claimRating(){return task;},async getActiveMcp(id:string){return {id,endpoint:'https://example.com/mcp'};},async finishRating(_id:string,_token:string,winner:string|null,completed:boolean){result={winner,completed};return true;}};
  const player:LadderPlayer={async choose(){return {};}};
  const connect=()=>({...player,async connect(){},async close(){closed++;}});
  assert.equal(await processOneRating(store,connect,async()=>({winner:0,actions:5})),true);
  assert.deepEqual(result,{winner:'a',completed:true});assert.equal(closed,2);
  assert.equal(await processOneRating(store,connect,async()=>{throw Error('invalid');}),true);
  assert.deepEqual(result,{winner:null,completed:false});assert.equal(closed,4);
})().catch(error=>{console.error(error);process.exitCode=1;});
