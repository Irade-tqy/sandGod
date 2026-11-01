import {createRequire} from 'node:module';
import {isAbsolute,resolve} from 'node:path';
import {Player} from './game';
import {Choice,LadderPlayer} from './ladder-match';
import {SoloGame} from './solo-game';

type ModelOpponent={chooseWeights(game:SoloGame,difficulty:number):Promise<number[]>;chooseStart(game:SoloGame,difficulty:number):Promise<number>;choose(game:SoloGame,difficulty:number):Promise<number>;close():void};
type LocalModule={Opponent?:new(profile:'latest',player:Player)=>ModelOpponent};

function modelOpponent(player:Player):ModelOpponent{
  const app=process.env.SANDGOD_LOCAL_MODEL_APP;
  if(!app||!isAbsolute(app))throw Error('本地参考策略未配置');
  const localRequire=createRequire(resolve(app,'package.json'));
  const LocalOpponent=(localRequire('./dist/opponent.js') as LocalModule).Opponent;
  if(typeof LocalOpponent!=='function')throw Error('本地参考策略不可用');
  return new LocalOpponent('latest',player);
}

export function visibleGame(game:SoloGame,player:Player):SoloGame{
  return new Proxy(game,{
    get(target,key,receiver){
      if(key==='ready')return target.ready;
      if(key==='positions'||key==='starts')return (Reflect.get(target,key,receiver) as (number|null)[]).map((value,seat)=>seat===player?value:null);
      if(key==='trace')return [];
      if(key==='walls')return new Set(target.walls);
      const value=Reflect.get(target,key,receiver);
      return typeof value==='function'?value.bind(receiver):value;
    },
    set(){throw Error('参考策略只能读取局面');}
  });
}

export class ReferenceOpponent implements LadderPlayer{
  private opponent?:ModelOpponent;
  private seat?:Player;
  private model(player:Player){
    if(this.opponent&&this.seat!==player)throw Error('参考策略座位无效');
    if(!this.opponent){this.opponent=modelOpponent(player);this.seat=player;}
    return this.opponent;
  }
  async choose(_phase:'weights'|'start'|'action',_state:ReturnType<SoloGame['snapshot']>,_legalActions:number[]):Promise<Choice>{throw Error('参考策略需要本机模型');}
  async chooseWithGame(phase:'weights'|'start'|'action',game:SoloGame,player:Player,_legalActions:number[]):Promise<Choice>{
    const opponent=this.model(player),view=visibleGame(game,player);
    if(phase==='weights')return {weights:await opponent.chooseWeights(view,100)};
    if(phase==='start')return {col:await opponent.chooseStart(view,100)};
    return {action:game.policyAction(await opponent.choose(view,100),player)};
  }
  async connect(){}
  async close(){this.opponent?.close();this.opponent=undefined;this.seat=undefined;}
}
