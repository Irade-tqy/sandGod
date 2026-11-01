import {createHash,randomUUID} from 'node:crypto';
import {InvalidStrategyError} from './evaluation-errors';
import {validateSourceSubmission} from './ladder-submission';

type Task={submissionId:string;playerId:string;path:string;sha256:string;size:number;kind:'c'|'cpp'};
type Store={claimSource(token:string):Promise<Task|null>;finishSource(id:string,token:string,accepted:boolean,artifactSha256:string|null,error:string|null):Promise<boolean>};
type Pipeline={download(path:string):Promise<Buffer>;compile(filename:string,source:Uint8Array):Promise<Buffer>;validate(wasm:Uint8Array):Promise<void>;save(id:string,wasm:Uint8Array):Promise<string>};

export async function processOneSource(store:Store,pipeline:Pipeline):Promise<boolean>{
  const token=randomUUID(),task=await store.claimSource(token);
  if(!task)return false;
  try{
    const source=await pipeline.download(task.path);
    if(source.length!==task.size||createHash('sha256').update(source).digest('hex')!==task.sha256)throw Error('源码校验失败，已保留云端副本');
    try{validateSourceSubmission('player.'+task.kind,source);}catch{throw new InvalidStrategyError('源码必须是 UTF-8 的 C 或 C++ 文本');}
    const wasm=await pipeline.compile('player.'+task.kind,source);
    await pipeline.validate(wasm);
    const artifactHash=await pipeline.save(task.submissionId,wasm);
    if(!await store.finishSource(task.submissionId,token,true,artifactHash,null))throw Error('评测任务已过期');
  }catch(error){
    if(!(error instanceof InvalidStrategyError))throw error;
    if(!await store.finishSource(task.submissionId,token,false,null,error.message.slice(0,240)))throw Error('评测任务已过期');
  }
  return true;
}
