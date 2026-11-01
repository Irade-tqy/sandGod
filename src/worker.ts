import {setTimeout as sleep} from 'node:timers/promises';
import {LadderStore} from './ladder-store';
import {McpOpponent} from './mcp-opponent';
import {processOneMcp} from './mcp-worker';
import {processOneRating} from './rating-worker';
import {processOneCleanup} from './cleanup-worker';
import {SourceStorage} from './source-storage';
import {ArtifactStore} from './artifact-store';
import {WasmOpponent} from './wasm-opponent';
import {compileSource} from './wasm-compiler';
import {processOneSource} from './source-worker';
import {validateCandidate} from './evaluate-ladder';
import {referencePlayer} from './reference-player';
import {EvaluationInfrastructureError} from './evaluation-errors';
import {ReferenceOpponent} from './reference-opponent';
import type {PlayerSource} from './ladder-store';

const secret=process.env.SANDGOD_SUPABASE_SECRET_KEY;
if(!secret)throw Error('天梯评测服务未配置数据库密钥');
const store=new LadderStore(secret);
const storage=new SourceStorage(secret);
const sourceEnabled=process.env.SANDGOD_ENABLE_SOURCE_EVAL==='1';
const artifactDirectory=process.env.SANDGOD_ARTIFACT_DIR;
if(sourceEnabled&&!artifactDirectory)throw Error('源码评测目录未配置');
const artifacts=artifactDirectory?new ArtifactStore(artifactDirectory):null;
let running=true;
let nextTask=0;
process.on('SIGTERM',()=>{running=false;});
process.on('SIGINT',()=>{running=false;});
void (async()=>{
  while(running){
    try{
      const make=(endpoint:string)=>new McpOpponent(endpoint);
      const makeRated=async(source:PlayerSource)=>{
        if(source.kind==='mcp')return make(source.endpoint);
        if(source.kind==='reference')return new ReferenceOpponent();
        if(!sourceEnabled||!artifacts)throw new EvaluationInfrastructureError('源码评测暂未开放');
        let wasm:Buffer;try{wasm=await artifacts.read(source.id,source.sha256);}catch{throw new EvaluationInfrastructureError('本地选手文件不可用');}
        const opponent=new WasmOpponent(wasm);
        return {choose:opponent.choose.bind(opponent),async connect(){},async close(){}};
      };
      const tasks=[()=>processOneMcp(store,make),()=>processOneRating(store,makeRated)];
      if(sourceEnabled&&artifacts)tasks.push(()=>processOneSource(store,{download:storage.download.bind(storage),compile:compileSource,validate:wasm=>validateCandidate(new WasmOpponent(wasm),referencePlayer),save:artifacts.save.bind(artifacts)}));
      let didWork=false;
      for(let offset=0;offset<tasks.length;offset++){
        const index=(nextTask+offset)%tasks.length;
        if(await tasks[index]()){nextTask=(index+1)%tasks.length;didWork=true;break;}
      }
      if(!didWork)await sleep(5000);
    }
    catch{console.error('评测队列暂时不可用');await sleep(10000);}
  }
})();
void (async()=>{
  while(running){
    try{if(!await processOneCleanup(store,storage))await sleep(5000);}
    catch{console.error('源码清理暂时不可用');await sleep(10000);}
  }
})();
