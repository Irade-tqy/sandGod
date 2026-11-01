import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {InvalidStrategyError} from './evaluation-errors';

const MAX_WASM=16*1024*1024, MAX_INPUT=1024*1024, MAX_OUTPUT=1024*1024;

export async function runWasm(wasm:Uint8Array, input:unknown):Promise<unknown> {
  if (!(wasm instanceof Uint8Array) || wasm.length<8 || wasm.length>MAX_WASM || !Buffer.from(wasm.slice(0,4)).equals(Buffer.from([0,97,115,109]))) throw Error('WASM 文件无效');
  const message=Buffer.from(JSON.stringify(input)+'\n');
  if(message.length>MAX_INPUT) throw Error('对局输入过大');
  const name='sandgod-eval-'+randomUUID();
  const args=['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','512m','--cpus','1','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=32m','-i','sandgod-wasm-runtime:50.0.1','timeout','--signal=KILL','10s','sh','-c','head -c "$1" > /tmp/entry.wasm && exec wasmtime run -C cache=n -W fuel=100000000,max-memory-size=67108864 /tmp/entry.wasm','sandbox',String(wasm.length)];
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
    const chunks:Buffer[]=[];let size=0, failure:string|null=null, settled=false;
    const stop=(reason:string)=>{if(failure)return;failure=reason;const killer=spawn('docker',['kill',name],{stdio:'ignore'});killer.on('error',()=>child.kill('SIGKILL'));killer.on('close',()=>child.kill('SIGKILL'));};
    const timer=setTimeout(()=>stop('策略运行超时'),12000);
    child.stdout.on('data',(data:Buffer)=>{size+=data.length;if(size>MAX_OUTPUT)stop('策略输出过大');else chunks.push(data);});
    child.stderr.on('data',()=>{});
    child.stdin.on('error',()=>{});
    child.on('error',error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}});
    child.on('close',code=>{if(settled)return;settled=true;clearTimeout(timer);if(failure)return reject(failure==='策略运行超时'?Error('策略运行环境超时'):new InvalidStrategyError(failure));if(code===125||code===126||code===127||code===137||code===null)return reject(Error('策略运行环境不可用'));if(code!==0)return reject(new InvalidStrategyError('策略运行失败'));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new InvalidStrategyError('策略输出不是有效的 JSON'));}});
    child.stdin.end(Buffer.concat([Buffer.from(wasm),message]));
  });
}
