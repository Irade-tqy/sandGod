import {randomUUID} from 'node:crypto';
import {LadderPlayer} from './ladder-match';
import {validateCandidate} from './evaluate-ladder';
import {referencePlayer} from './reference-player';
import {EvaluationInfrastructureError} from './evaluation-errors';

type Task={submissionId:string;playerId:string;endpoint:string};
type Store={claimMcp(token:string):Promise<Task|null>;finishMcp(id:string,token:string,accepted:boolean,error:string|null):Promise<boolean>};
type ConnectedPlayer=LadderPlayer & {connect():Promise<void>;close():Promise<void>};

export async function processOneMcp(store:Store,connect:(endpoint:string)=>ConnectedPlayer,validate=validateCandidate):Promise<boolean>{
  const token=randomUUID(),task=await store.claimMcp(token);
  if(!task)return false;
  let player:ConnectedPlayer|undefined,accepted=false;
  try{
    player=connect(task.endpoint);
    await player.connect();
    await validate(player,referencePlayer);
    accepted=true;
  }catch(error){
    if(error instanceof EvaluationInfrastructureError)throw error;
    accepted=false;
  }finally{
    try{await player?.close();}catch{}
  }
  const error=accepted?null:'验证失败：MCP 服务不可用、超时或返回了无效行动，请检查后重新提交。';
  if(!await store.finishMcp(task.submissionId,token,accepted,error))throw Error('评测任务已过期');
  return true;
}
