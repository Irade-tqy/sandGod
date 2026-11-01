import {randomUUID} from 'node:crypto';

type Store={claimCleanup(token:string):Promise<{id:string;path:string}|null>;finishCleanup(id:string,token:string,deleted:boolean):Promise<boolean>};
type Storage={remove(path:string):Promise<void>};

export async function processOneCleanup(store:Store,storage:Storage):Promise<boolean>{
  const token=randomUUID(),task=await store.claimCleanup(token);
  if(!task)return false;
  let deleted=false;
  try{await storage.remove(task.path);deleted=true;}catch{}
  if(!await store.finishCleanup(task.id,token,deleted))throw Error('清理任务已过期');
  return true;
}
