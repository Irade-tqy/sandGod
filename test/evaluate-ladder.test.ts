import assert from 'node:assert/strict';
import {evaluateLadderMatch} from '../src/evaluate-ladder';
import {LadderPlayer} from '../src/ladder-match';

const valid:LadderPlayer={async choose(phase,_state,legal){return phase==='weights'?{weights:[25,25,25,25]}:phase==='start'?{col:4}:{action:legal[0]};}};
const invalid:LadderPlayer={async choose(phase,state,legal){return phase==='action'?{action:999}:valid.choose(phase,state,legal);}};
void (async()=>{
  const calls:string[][]=[];
  const store={async recordMatch(match:string,first:string,second:string,winner:string){calls.push([match,first,second,winner]);}};
  await assert.rejects(evaluateLadderMatch({id:'a',player:valid},{id:'b',player:invalid},store,()=>0));
  assert.equal(calls.length,0);
  const result=await evaluateLadderMatch({id:'a',player:valid},{id:'b',player:valid},store,()=>0);
  assert.equal(calls.length,1);
  assert.equal(calls[0][3],result.winnerId);
  await assert.rejects(evaluateLadderMatch({id:'a',player:valid},{id:'a',player:valid},store));
  assert.equal(calls.length,1);
})().catch(error=>{console.error(error);process.exitCode=1;});
