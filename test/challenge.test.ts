import assert from 'node:assert/strict';
import {challengeLadder} from '../src/challenge';
import {LadderPlayer} from '../src/ladder-match';

void (async()=>{
  const statuses:string[]=[];
  const store={async getActiveMcp(id:string){return {id,endpoint:'https://example.com/mcp'};},async setMcpStatus(_id:string,status:'online'|'offline'){statuses.push(status);}};
  const player:LadderPlayer={async choose(phase,_state,legal){return phase==='weights'?{weights:[25,25,25,25]}:phase==='start'?{col:4}:{action:legal[0]};}};
  const online=()=>({...player,async connect(){},async close(){}});
  const offline=()=>({...player,async connect(){throw Error('unreachable');},async close(){}});
  await assert.rejects(challengeLadder('entry',0,[0,0,0,100],store,online,()=>{},()=>{}));
  assert.deepEqual(statuses,[]);
  await assert.rejects(challengeLadder('entry',0,[25,25,25,25],store,offline,()=>{},()=>{}),/离线/);
  assert.deepEqual(statuses,['offline']);
  const session=await challengeLadder('entry',0,[25,25,25,25],store,online,()=>{},()=>{});
  assert.deepEqual(statuses,['offline','online']);
  await session.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
