import {randomUUID} from 'node:crypto';
import {LadderPlayer,playLadderMatch} from './ladder-match';
import {EvaluationInfrastructureError} from './evaluation-errors';

type ConnectedPlayer=LadderPlayer & {connect():Promise<void>;close():Promise<void>};
export type PlayerSource={kind:'mcp';endpoint:string}|{kind:'wasm';id:string;sha256:string};
type Store={claimRating(token:string):Promise<{jobId:string;first:string;second:string}|null>;getActivePlayer(id:string):Promise<PlayerSource|null>;finishRating(id:string,token:string,winner:string|null,completed:boolean):Promise<boolean>};

export async function processOneRating(store:Store,connect:(source:PlayerSource)=>Promise<ConnectedPlayer>,play=playLadderMatch):Promise<boolean>{
  const token=randomUUID(),task=await store.claimRating(token);
  if(!task)return false;
  const entries=await Promise.all([store.getActivePlayer(task.first),store.getActivePlayer(task.second)]);
  const players:ConnectedPlayer[]=[];let winner:string|null=null;
  try{
    if(!entries[0]||!entries[1])throw Error('选手不可用');
    players.push(await connect(entries[0]));
    players.push(await connect(entries[1]));
    for(const player of players)await player.connect();
    const result=await play([players[0],players[1]]);
    winner=result.winner===0?task.first:task.second;
  }catch(error){
    if(error instanceof EvaluationInfrastructureError)throw error;
    winner=null;
  }finally{
    await Promise.all(players.map(async player=>{try{await player.close();}catch{}}));
  }
  if(!await store.finishRating(task.jobId,token,winner,winner!==null))throw Error('评测任务已过期');
  return true;
}
