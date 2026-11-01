import assert from 'node:assert/strict';
import {compileSource} from '../src/wasm-compiler';
import {WasmOpponent} from '../src/wasm-opponent';
import {playLadderMatch} from '../src/ladder-match';
import {referencePlayer} from '../src/reference-player';

void (async()=>{
  const source=Buffer.from(`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static char input[1048576];
int main(void) {
  if (!fgets(input, sizeof input, stdin)) return 1;
  if (strstr(input, "\\\"phase\\\":\\\"weights\\\"")) puts("{\\\"weights\\\":[25,25,25,25]}");
  else if (strstr(input, "\\\"phase\\\":\\\"start\\\"")) puts("{\\\"col\\\":4}");
  else {
    char *legal = strstr(input, "\\\"legalActions\\\":[");
    if (!legal) return 1;
    printf("{\\\"action\\\":%d}\\n", atoi(legal + strlen("\\\"legalActions\\\":[")));
  }
  return 0;
}`);
  const player=new WasmOpponent(await compileSource('match.c',source));
  const result=await playLadderMatch([player,referencePlayer],()=>0.1);
  assert.ok(result.winner===0||result.winner===1);
  assert.ok(result.actions>0);
  console.log('隔离源码完成真实规则对局：',result.actions,'次行动');
})().catch(error=>{console.error(error);process.exitCode=1;});
