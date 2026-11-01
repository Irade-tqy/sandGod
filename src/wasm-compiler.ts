import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {validateSourceSubmission} from './ladder-submission';
import {InvalidStrategyError} from './evaluation-errors';

export async function compileSource(filename:string,source:Uint8Array):Promise<Buffer>{
  const language=validateSourceSubmission(filename,source);
  const compiler=language==='c'?'clang':'clang++',extension=language==='c'?'c':'cpp';
  const name='sandgod-compile-'+randomUUID();
  const script='cat > /tmp/source.'+extension+' && /opt/wasi-sdk/bin/'+compiler+' -O2 -Wl,--max-memory=67108864 /tmp/source.'+extension+' -o /tmp/strategy.wasm && cat /tmp/strategy.wasm';
  const args=['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','1024m','--cpus','1','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=128m','-i','sandgod-wasm-compiler:34.0','timeout','--signal=KILL','30s','sh','-c',script];
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
    const output:Buffer[]=[],diagnostics:Buffer[]=[];let bytes=0,diagnosticBytes=0,failure:string|null=null,settled=false;
    const stop=(reason:string)=>{if(failure)return;failure=reason;const killer=spawn('docker',['kill',name],{stdio:'ignore'});killer.on('error',()=>child.kill('SIGKILL'));killer.on('close',()=>child.kill('SIGKILL'));};
    const timer=setTimeout(()=>stop('编译超时'),32000);
    child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>16*1024*1024)stop('编译结果过大');else output.push(chunk);});
    child.stderr.on('data',(chunk:Buffer)=>{if(diagnosticBytes<8192){const part=chunk.subarray(0,8192-diagnosticBytes);diagnostics.push(part);diagnosticBytes+=part.length;}});
    child.stdin.on('error',()=>{});
    child.on('error',error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}});
    child.on('close',code=>{if(settled)return;settled=true;clearTimeout(timer);if(failure)return reject(failure==='编译超时'?Error('编译环境超时'):new InvalidStrategyError(failure));if(code===125||code===126||code===127||code===137||code===null)return reject(Error('编译环境不可用'));if(code!==0){const detail=Buffer.concat(diagnostics).toString('utf8').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180);return reject(new InvalidStrategyError('编译失败：'+detail));}const wasm=Buffer.concat(output);if(wasm.length<8||!wasm.subarray(0,4).equals(Buffer.from([0,97,115,109])))return reject(Error('编译结果无效'));resolve(wasm);});
    child.stdin.end(Buffer.from(source));
  });
}
