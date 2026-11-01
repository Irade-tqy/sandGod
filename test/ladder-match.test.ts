import assert from 'node:assert/strict';
import {chooseLadderPlayer,playLadderMatch,LadderPlayer} from '../src/ladder-match';
import {visibleGame} from '../src/reference-opponent';
import {SoloGame} from '../src/solo-game';

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
  const game=new SoloGame();let internalGame:SoloGame|null=null;
  game.choose(0,4);game.choose(1,3);
  const view=visibleGame(game,0);
  assert.equal(view.ready,true);
  assert.deepEqual(view.positions,[72+4,null]);
  assert.deepEqual(view.starts,[72+4,null]);
  assert.ok(view.legal(0).length>0);
  await chooseLadderPlayer({...valid,async chooseWithGame(_phase,state){internalGame=state;return {weights:[25,25,25,25]};}},'weights',game,0,[]);
  assert.equal(internalGame,game);
  await assert.rejects(playLadderMatch([invalid,valid]),/无效行动/);
  await assert.rejects(playLadderMatch([{async choose(){return {weights:[0,0,0,100]};}},valid]),/概率/);
  const previousNow=Date.now;let time=0;Date.now=()=>time;
  try {
    const slow:LadderPlayer={async choose(){time=15*60*1000;return {weights:[25,25,25,25]};}};
    await assert.rejects(playLadderMatch([slow,valid]),/超时/);
  } finally { Date.now=previousNow; }
  const result=await playLadderMatch([valid,valid],()=>0);
  assert.ok(result.winner===0||result.winner===1);
})().catch(error=>{console.error(error);process.exitCode=1;});
