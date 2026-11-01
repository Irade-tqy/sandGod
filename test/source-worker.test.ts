import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {InvalidStrategyError} from '../src/evaluation-errors';
import {processOneSource} from '../src/source-worker';

void (async()=>{
  const source=Buffer.from('int main(){}'),sha256=createHash('sha256').update(source).digest('hex');
  const task={submissionId:'submission',playerId:'player',path:'private',sha256,size:source.length,kind:'c' as const};
  let result:{accepted:boolean;error:string|null}|null=null;
  const store={async claimSource(){return task;},async finishSource(_id:string,_token:string,accepted:boolean,_hash:string|null,error:string|null){result={accepted,error};return true;}};
  const pipeline={async download(){return source;},async compile(){return Buffer.from([0,97,115,109,1,0,0,0]);},async validate(){},async save(){return 'a'.repeat(64);}};
  assert.equal(await processOneSource(store,pipeline),true);assert.deepEqual(result,{accepted:true,error:null});
  await processOneSource(store,{...pipeline,async compile(){throw new InvalidStrategyError('编译失败');}});
  assert.deepEqual(result,{accepted:false,error:'编译失败'});
  result=null;
  await assert.rejects(processOneSource(store,{...pipeline,async download(){throw Error('网络故障');}}));
  assert.equal(result,null);
  await assert.rejects(processOneSource(store,{...pipeline,async download(){return Buffer.from('corrupt');}}));
  assert.equal(result,null);
  await assert.rejects(processOneSource(store,{...pipeline,async compile(){throw Error('编译环境超时');}}));
  assert.equal(result,null);
  await assert.rejects(processOneSource(store,{...pipeline,async validate(){throw Error('策略运行环境超时');}}));
  assert.equal(result,null);
  await assert.rejects(processOneSource(store,{...pipeline,async save(){throw Error('本地磁盘不可用');}}));
  assert.equal(result,null);
})().catch(error=>{console.error(error);process.exitCode=1;});
