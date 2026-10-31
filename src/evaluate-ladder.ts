import {randomUUID} from 'node:crypto';
import {LadderPlayer,playLadderMatch} from './ladder-match';

type RatedPlayer={id:string;player:LadderPlayer};
type RatingStore={recordMatch(matchId:string,first:string,second:string,winner:string):Promise<void>};

// Validation games never enter the ladder rating ledger.
export async function validateCandidate(candidate:LadderPlayer,reference:LadderPlayer):Promise<void>{
  await playLadderMatch([candidate,reference]);
  await playLadderMatch([reference,candidate]);
}

export async function evaluateLadderMatch(first:RatedPlayer,second:RatedPlayer,store:RatingStore,random:()=>number=Math.random){
  if(!first.id||!second.id||first.id===second.id)throw Error('天梯选手无效');
  const result=await playLadderMatch([first.player,second.player],random);
  const winner=result.winner===0?first.id:second.id;
  await store.recordMatch(randomUUID(),first.id,second.id,winner);
  return {...result,winnerId:winner};
}
