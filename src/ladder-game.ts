import {Player} from './game';
import {chooseLadderPlayer,LadderPlayer} from './ladder-match';
import {SoloGame} from './solo-game';

type Snapshot=ReturnType<SoloGame['snapshot']>;

// Only an already-approved ladder entry is passed to this class by the server.
export class LadderGame {
  private game=new SoloGame(0);
  private active=true;
  private running=false;
  private readonly bot:Player;
  constructor(private human:Player,private opponent:LadderPlayer,private emit:(state:Snapshot)=>void,private onError:(error:Error)=>void){this.bot=(1-human) as Player;}
  async start(weights:number[]){
    this.game.setMovementWeights(this.human,weights);
    const choice=await chooseLadderPlayer(this.opponent,'weights',this.game,this.bot,[]);
    if(!this.active)return;
    this.game.setMovementWeights(this.bot,choice?.weights??[]);
    const start=await chooseLadderPlayer(this.opponent,'start',this.game,this.bot,[]);
    if(!this.active)return;
    this.game.choose(this.bot,start?.col as number);
    this.show();
  }
  choose(col:number){if(!this.active)throw Error('对局已关闭');this.game.choose(this.human,col);this.show();this.pump();}
  action(value:number,manual:boolean){
    if(!this.active||!Number.isInteger(value))throw Error('行动无效');
    const action=this.game.policyAction(value,this.human);
    if(!this.game.legal(this.human).includes(action))throw Error('这个行动不可用');
    const wasPending=this.game.pendingManual;
    this.game.act(this.human,action,true);
    if(!wasPending&&this.game.pendingManual&&!manual)this.game.act(this.human,4);
    this.show();this.pump();
  }
  close(){this.active=false;}
  setListener(emit:(state:Snapshot)=>void){this.emit=emit;}
  private show(){if(this.active)this.emit(this.game.snapshot(this.human));}
  private pump(){
    if(this.running||!this.active)return;
    this.running=true;
    setImmediate(()=>{void this.play().catch(error=>{if(this.active)this.onError(error instanceof Error?error:Error('天梯选手不可用'));}).finally(()=>{this.running=false;});});
  }
  private async play(){
    while(this.active&&this.game.ready&&this.game.winner===null&&this.game.turn===this.bot){
      const legal=this.game.legal(this.bot).map(action=>this.game.policyAction(action,this.bot));
      const response=await chooseLadderPlayer(this.opponent,'action',this.game,this.bot,legal);
      if(!this.active)return;
      if(!Number.isInteger(response?.action)||!legal.includes(response.action as number))throw Error('天梯选手返回无效行动');
      this.game.act(this.bot,this.game.policyAction(response.action as number,this.bot),true);
      this.show();
    }
  }
}
