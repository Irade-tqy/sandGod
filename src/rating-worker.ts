import {randomUUID} from 'node:crypto';
import {LadderPlayer,playLadderMatch} from './ladder-match';

type ConnectedPlayer=LadderPlayer & {connect():Promise<void>;close():Promise<void>};
type Store={claimRating(token:string):Promise<{jobId:string;first:string;second:string}|null>;getActiveMcp(id:string):Promise<{id:string;endpoint:string}|null>;finishRating(id:string,token:string,winner:string|null,completed:boolean):Promise<boolean>};

export async function processOneRating(store:Store,connect:(endpoint:string)=>ConnectedPlayer,play=playLadderMatch):Promise<boolean>{
  const token=randomUUID(),task=await store.claimRating(token);
  if(!task)return false;
  const players:ConnectedPlayer[]=[];let winner:string|null=null;
  try{
    const entries=await Promise.all([store.getActiveMcp(task.first),store.getActiveMcp(task.second)]);
    if(!entries[0]||!entries[1])throw Error('选手不可用');
    players.push(connect(entries[0].endpoint));
    players.push(connect(entries[1].endpoint));
    await Promise.all(players.map(player=>player.connect()));
    const result=await play([players[0],players[1]]);
    winner=result.winner===0?task.first:task.second;
  }catch{
    winner=null;
  }finally{
    await Promise.all(players.map(async player=>{try{await player.close();}catch{}}));
  }
  if(!await store.finishRating(task.jobId,token,winner,winner!==null))throw Error('评测任务已过期');
  return true;
}
