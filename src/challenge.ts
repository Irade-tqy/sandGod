import {Player} from './game';
import {SoloGame} from './solo-game';
import {LadderGame} from './ladder-game';
import {LadderPlayer} from './ladder-match';
import {EvaluationInfrastructureError} from './evaluation-errors';
import type {PlayerSource} from './ladder-store';

type ConnectedPlayer=LadderPlayer & {connect():Promise<void>;close():Promise<void>};
type Store={getActivePlayer(id:string):Promise<PlayerSource|null>;setMcpStatus(id:string,status:'online'|'offline'):Promise<void>};

export async function challengeLadder(id:string,human:Player,weights:number[],store:Store,connect:(source:PlayerSource)=>ConnectedPlayer,emit:(state:ReturnType<SoloGame['snapshot']>)=>void,onError:(error:Error)=>void) {
  if(human!==0&&human!==1)throw Error('玩家位置无效');
  new SoloGame().setMovementWeights(human,weights);
  const entry=await store.getActivePlayer(id);
  if(!entry)throw Error('天梯选手不可用');
  let opponent:ConnectedPlayer|undefined;
  let game:LadderGame|undefined;
  let initial:ReturnType<SoloGame['snapshot']>|undefined;
  try {
    opponent=connect(entry);
    await opponent.connect();
    game=new LadderGame(human,opponent,state=>{initial=state;},onError);
    await game.start(weights);
  } catch(error) {
    game?.close();
    try{await opponent?.close();}catch{}
    if(error instanceof EvaluationInfrastructureError)throw Error('天梯网络暂时不可用');
    if(entry.kind==='mcp'){
      await store.setMcpStatus(id,'offline');
      throw Error('MCP 选手离线或不可用');
    }
    if(entry.kind==='reference')throw Error('参考策略暂时不可用');
    throw Error('天梯选手不可用');
  }
  try { if(entry.kind==='mcp')await store.setMcpStatus(id,'online'); }
  catch(error){game.close();try{await opponent.close();}catch{}throw error;}
  game.setListener(emit);
  if(initial)emit(initial);
  return {game,close:async()=>{game.close();await opponent.close();}};
}
