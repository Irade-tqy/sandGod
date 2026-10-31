import assert from 'node:assert/strict';
import {playLadderMatch,LadderPlayer} from '../src/ladder-match';

const valid:LadderPlayer={async choose(phase,_state,legal){
  if(phase==='weights')return {weights:[25,25,25,25]};
  if(phase==='start')return {col:4};
  return {action:legal[0]};
}};
const invalid:LadderPlayer={async choose(phase,state,legal){
  if(phase==='action')return {action:999};
  return valid.choose(phase,state,legal);
}};
void (async()=>{
  await assert.rejects(playLadderMatch([invalid,valid]),/无效行动/);
  await assert.rejects(playLadderMatch([{async choose(){return {weights:[0,0,0,100]};}},valid]),/概率/);
  const result=await playLadderMatch([valid,valid],()=>0);
  assert.ok(result.winner===0||result.winner===1);
})().catch(error=>{console.error(error);process.exitCode=1;});
