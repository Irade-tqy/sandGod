import assert from 'node:assert/strict';
import {LadderGame} from '../src/ladder-game';
import {LadderPlayer} from '../src/ladder-match';
import {SoloGame} from '../src/solo-game';

const bot:LadderPlayer={async choose(phase,state,legal){
  if(phase==='weights')return {weights:[25,25,25,25]};
  if(phase==='start')return {col:4};
  assert.equal(state.opponentPosition,null);
  return {action:legal[0]};
}};
void (async()=>{
  let state:ReturnType<SoloGame['snapshot']>|null=null;
  let wake:()=>void=()=>{};
  const changed=new Promise<void>(resolve=>{wake=resolve;});
  const game=new LadderGame(1,bot,next=>{state=next;if(next.ready&&next.turn==='you')wake();},error=>{throw error;});
  await game.start([25,25,25,25]);
  game.choose(4);
  await changed;
  assert.equal((state as unknown as ReturnType<SoloGame['snapshot']>).opponentPosition,null);
  game.close();
  assert.throws(()=>game.choose(3));
})().catch(error=>{console.error(error);process.exitCode=1;});
