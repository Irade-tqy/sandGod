import {Game,Player,WALLS,geometry,neighbor,transform} from './game';

export class SoloGame extends Game {
 readonly randomMovement=true;
 private owned=[Array(112).fill(0),Array(112).fill(0)];
 private movementWeights:number[][]=[[25,25,25,25],[25,25,25,25]];
 boundary=0;rounds=0;manualUsed=false;pendingManual=false;
 constructor(first:Player=0,private readonly movementRandom:()=>number=Math.random){super(first);}

 // Directions are relative to the player's board, in up/right/down/left order.
 setMovementWeights(p:Player,weights:number[]){
  if(this.ready||!Array.isArray(weights)||weights.length!==4||weights.some(n=>!Number.isInteger(n)||n<1)||weights.reduce((a,b)=>a+b,0)!==100)throw Error('四个方向概率必须是至少 1% 的整数，总和为 100%。');
  this.movementWeights[p]=weights.slice();
 }
 weights(p:Player){return this.movementWeights[p].slice();}
 moveWeight(p:Player,direction:number){return this.movementWeights[p][transform(direction,p)];}

 private fits(w:number){const wall=WALLS[w];return wall.orientation?wall.col>=this.boundary&&wall.col+1<=8-this.boundary:wall.col>=this.boundary&&wall.col+2<=8-this.boundary;}
 get canPass(){return this.boundary===4&&!this.pendingManual;}
 get manualAvailable(){return this.turn!==this.first&&!this.manualUsed;}
 policyAction(a:number,p:Player){return (this.pendingManual||this.canPass)&&a===4?4:transform(a,p);}
 moves(p:Player){const board=geometry(this.walls,this.boundary),q=this.positions[p]!,result:number[]=[];for(let k=0;k<4;k++)if(neighbor(q,k)>=0&&!board.blocked[q][k])result.push(k);return result;}
 legal(p:Player):number[]{
  if(!this.ready||this.winner!==null||this.turn!==p)return [];
  if(this.pendingManual)return [...this.moves(p),4];
  if(this.canPass)return [4];
  const result:number[]=[],own=new Set<number>();for(let w=0;w<112;w++)if(this.owned[p][w])own.add(w);
  for(let w=0;w<112;w++){
   if(!this.fits(w))continue;
   const blocked=geometry(new Set([...own,w]),this.boundary).blocked,start=this.boundary,seen=new Set([start]),queue=[start];
   for(let i=0;i<queue.length;i++)for(let k=0;k<4;k++){const q=queue[i],next=neighbor(q,k);if(next>=0&&!blocked[q][k]&&!seen.has(next)){seen.add(next);queue.push(next);}}
   if(seen.size===9*(9-2*this.boundary))result.push(4+w);
  }
  for(let w=0;w<112;w++)if(this.owned[p][w]>0)result.push(116+w);
  return result;
 }
 wallCount(p:Player):number{return this.owned[p].reduce((sum,count)=>sum+count,0);}
 wallFeature(w:number,p:Player):number{return this.owned[p][w]>0?(this.owned[1-p][w]>0?1.25:.75):1;}
 previewWalls(p:Player,action:number):Set<number>{
  const result=new Set(this.walls);if(this.pendingManual||this.canPass)return result;
  const w=action<116?action-4:action-116;
  // Overlapping opponent ownership is hidden; assume the wall disappears.
  if(action<116)result.add(w);else if(this.owned[p][w]===1)result.delete(w);return result;
 }
 act(p:Player,action:number,askManual=false){
  if(!Number.isInteger(action)||!this.legal(p).includes(action))throw Error('这个行动不可用。');
  if(this.pendingManual){this.pendingManual=false;if(action<4)this.manualUsed=true;this.move(p,action<4?action:null);return;}
  if(!this.canPass){const placing=action<116,w=placing?action-4:action-116;this.owned[p][w]+=placing?1:-1;this.inventory[p]+=placing?-1:1;if(this.owned[0][w]||this.owned[1][w])this.walls.add(w);else this.walls.delete(w);this.events.push({player:p,kind:placing?'wall':'remove',wall:w});this.trace.push({positions:[...this.positions],player:p,action});}
  else this.events.push({player:p,kind:'pass'});
  if(askManual&&this.manualAvailable&&this.moves(p).length){this.pendingManual=true;return;}
  this.move(p,null);
 }
 private move(p:Player,direction:number|null){
  const moves=this.moves(p),q=this.positions[p]!,walls=[...this.walls],draw=this.movementRandom();
  if(moves.length){let chosen=direction;if(chosen===null){let remaining=draw*moves.reduce((sum,k)=>sum+this.moveWeight(p,k),0);chosen=moves[moves.length-1];for(const k of moves){remaining-=this.moveWeight(p,k);if(remaining<0){chosen=k;break;}}}this.positions[p]=neighbor(q,chosen);this.events.push({player:p,kind:'move',walls,boundary:this.boundary,manual:direction!==null});this.trace.push({positions:[...this.positions],player:p,action:chosen});}else this.events.push({player:p,kind:'stuck'});
  if(Math.floor(this.positions[p]!/9)===(p?8:0))this.winner=p;
  if(p!==this.first){this.rounds++;if(this.winner===null&&this.rounds%20===0&&this.boundary<4)this.shrink(p);}
  this.turn=(1-p) as Player;
 }
 private shrink(p:Player){
  this.boundary++;const removed:number[]=[];
  for(const w of this.walls)if(!this.fits(w)){removed.push(w);this.owned[0][w]=this.owned[1][w]=0;this.walls.delete(w);}
  for(const side of [0,1] as Player[]){const q=this.positions[side]!,row=Math.floor(q/9),col=q%9;this.positions[side]=row*9+Math.max(this.boundary,Math.min(8-this.boundary,col));}
  this.events.push({player:p,kind:'shrink',boundary:this.boundary});this.trace.push({positions:[...this.positions],player:null,action:null,boundary:this.boundary,removedWalls:removed});
 }
 reset(_p:Player){throw Error('本局规则没有重置。');}
 snapshot(p:Player){
  const state=super.snapshot(p),special=this.pendingManual||this.canPass;
  return {...state,ownFirst:this.first===p,legal:this.legal(p).map(a=>special&&a===4?4:transform(a,p)),resetAvailable:false,randomMovement:true,unlimitedWalls:true,boundary:this.boundary,rounds:this.rounds,manualAvailable:this.turn===p&&this.manualAvailable,pendingManual:this.turn===p&&this.pendingManual,canPass:this.turn===p&&this.canPass,ownWallCount:this.wallCount(p),opponentWallCount:this.wallCount((1-p) as Player),walls:state.walls.map(w=>({...w,owned:this.owned[p][transform(w.id+4,p)-4]>0,opponentOwned:this.owned[1-p][transform(w.id+4,p)-4]>0})),
   history:this.events.map(e=>({player:e.player===p?0:1,text:e.kind==='shrink'?`棋盘缩小至 ${9-2*(e.boundary??0)} 列`:(e.player===this.first?'先手':'后手')+(e.kind==='move'?(e.manual?'自主移动了一步':'移动了一步'):e.kind==='remove'?'拆除了一堵墙':e.kind==='stuck'?'被困，无法移动':e.kind==='pass'?'等待随机移动':'建造了一堵墙')}))};
 }
}
