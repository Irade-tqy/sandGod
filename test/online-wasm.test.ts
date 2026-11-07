import assert from 'node:assert/strict';
import {WasmSlots} from '../src/online-wasm';

void (async()=>{
 const slots=new WasmSlots(1,1,30);let release!:()=>void;
 const first=slots.run(()=>new Promise<number>(resolve=>{release=()=>resolve(1);}));
 const second=slots.run(async()=>2);
 await assert.rejects(slots.run(async()=>3),/繁忙/);
 release();assert.equal(await first,1);assert.equal(await second,2);
 await assert.rejects(slots.run(async()=>{throw Error('strategy failed');}),/strategy failed/);
 assert.equal(await slots.run(async()=>4),4);
 let finish!:()=>void;const busy=slots.run(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await assert.rejects(slots.run(async()=>5),/繁忙/);finish();await busy;
 assert.equal(await slots.run(async()=>6),6);
})().catch(error=>{console.error(error);process.exitCode=1;});
