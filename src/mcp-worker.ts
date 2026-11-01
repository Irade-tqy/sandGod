import {randomUUID} from 'node:crypto';
import {LadderPlayer} from './ladder-match';
import {validateCandidate} from './evaluate-ladder';

type Task={submissionId:string;playerId:string;endpoint:string};
type Store={claimMcp(token:string):Promise<Task|null>;finishMcp(id:string,token:string,accepted:boolean,error:string|null):Promise<boolean>};
type ConnectedPlayer=LadderPlayer & {connect():Promise<void>;close():Promise<void>};
const reference:LadderPlayer={async choose(phase,_state,legal){
  if(phase==='weights')return {weights:[25,25,25,25]};
  if(phase==='start')return {col:4};
  if(!legal.length)throw Error('没有合法行动');
  return {action:legal[0]};
}};

export async function processOneMcp(store:Store,connect:(endpoint:string)=>ConnectedPlayer,validate=validateCandidate):Promise<boolean>{
  const token=randomUUID(),task=await store.claimMcp(token);
  if(!task)return false;
  let player:ConnectedPlayer|undefined,accepted=false;
  try{
    player=connect(task.endpoint);
    await player.connect();
    await validate(player,reference);
    accepted=true;
  }catch{
    accepted=false;
  }finally{
    try{await player?.close();}catch{}
  }
  const error=accepted?null:'验证失败：MCP 服务不可用、超时或返回了无效行动，请检查后重新提交。';
  if(!await store.finishMcp(task.submissionId,token,accepted,error))throw Error('评测任务已过期');
  return true;
}
