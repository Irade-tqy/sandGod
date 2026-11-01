import assert from 'node:assert/strict';
import {compileSource} from '../src/wasm-compiler';
import {runWasm} from '../src/wasm-runner';
import {InvalidStrategyError} from '../src/evaluation-errors';

void (async()=>{
  const program=Buffer.from('#include <stdio.h>\nint main(void){char line[256];if(!fgets(line,sizeof line,stdin))return 1;puts("{\\"ok\\":true}");return 0;}');
  const wasm=await compileSource('sample.c',program);
  assert.deepEqual(await runWasm(wasm,{turn:1}),{ok:true});
  const invalid=await compileSource('invalid-output.c',Buffer.from('#include <stdio.h>\nint main(void){puts("not json");}'));
  await assert.rejects(runWasm(invalid,{}),InvalidStrategyError);
  process.env.SANDGOD_SANDBOX_TEST_SECRET='sandbox-test-only';
  const probe=await compileSource('probe.c',Buffer.from('#include <stdio.h>\n#include <stdlib.h>\nint main(void){FILE *f=fopen("/etc/passwd","r");volatile unsigned char *p=malloc(70*1024*1024);if(p){p[0]=1;p[70*1024*1024-1]=2;}printf("{\\"file\\":%d,\\"secret\\":%d,\\"memory\\":%d}\\n",f!=NULL,getenv("SANDGOD_SANDBOX_TEST_SECRET")!=NULL,p!=NULL);}'));
  assert.deepEqual(await runWasm(probe,{}),{file:0,secret:0,memory:0});
  const loop=await compileSource('loop.c',Buffer.from('int main(void){volatile unsigned n=0;for(;;)n++;}'));
  await assert.rejects(runWasm(loop,{}),InvalidStrategyError);
  console.log('WASM execution integration checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
