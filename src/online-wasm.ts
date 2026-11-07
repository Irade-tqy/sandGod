import {ArtifactStore} from './artifact-store';
import {WasmOpponent} from './wasm-opponent';
import {SoloGame} from './solo-game';
import {EvaluationInfrastructureError} from './evaluation-errors';

export class WasmSlots {
  private active=0;
  private waiting:{run:()=>void;timer:ReturnType<typeof setTimeout>}[]=[];
  constructor(private readonly limit=4,private readonly maxWaiting=16,private readonly timeout=30000){}
  async run<T>(work:()=>Promise<T>):Promise<T>{
    if(this.active>=this.limit){
      if(this.waiting.length>=this.maxWaiting)throw new EvaluationInfrastructureError('天梯繁忙');
      await new Promise<void>((resolve,reject)=>{
        const entry={run:resolve,timer:setTimeout(()=>{const index=this.waiting.indexOf(entry);if(index>=0)this.waiting.splice(index,1);reject(new EvaluationInfrastructureError('天梯繁忙'));},this.timeout)};
        this.waiting.push(entry);
      });
    }else this.active++;
    try{return await work();}finally{const next=this.waiting.shift();if(next){clearTimeout(next.timer);next.run();}else this.active--;}
  }
}

export class OnlineWasmOpponent {
  private opponent?:WasmOpponent;
  constructor(private readonly store:ArtifactStore,private readonly id:string,private readonly hash:string,private readonly slots:WasmSlots){}
  async connect(){this.opponent=new WasmOpponent(await this.store.read(this.id,this.hash));}
  async choose(phase:'weights'|'start'|'action',state:ReturnType<SoloGame['snapshot']>,legal:number[]){
    const opponent=this.opponent;if(!opponent)throw new EvaluationInfrastructureError('天梯选手不可用');
    return this.slots.run(()=>opponent.choose(phase,state,legal));
  }
  async close(){this.opponent=undefined;}
}
