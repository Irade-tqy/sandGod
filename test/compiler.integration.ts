import assert from 'node:assert/strict';
import {compileSource} from '../src/wasm-compiler';

void (async()=>{
  const c=await compileSource('sample.c',Buffer.from('int main(void){return 0;}'));
  const cpp=await compileSource('sample.cpp',Buffer.from('#include <cstdio>\nint main(){std::puts("ok");}'));
  assert.ok(c.length>8&&cpp.length>8);
  await assert.rejects(compileSource('invalid.c',Buffer.from('invalid!')),/编译失败/);
})().catch(error=>{console.error(error);process.exitCode=1;});
