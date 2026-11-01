import {randomUUID} from 'node:crypto';
export type Player = 0 | 1;
type Wall = {orientation: number; row: number; col: number; edges: [number, number][]};
export const WALLS: Wall[] = [];
for (let orientation=0;orientation<2;orientation++) for(let row=0;row<(orientation?7:8);row++) for(let col=0;col<(orientation?8:7);col++) WALLS.push({orientation,row,col,edges:Array.from({length:3},(_,j):[number,number]=>[orientation?(row+j)*9+col:row*9+col+j,orientation?1:2])});
export function neighbor(q:number,k:number):number {const r=Math.floor(q/9),c=q%9;return [r?q-9:-1,c<8?q+1:-1,r<8?q+9:-1,c?q-1:-1][k];}
const mirror=(q:number)=> (8-Math.floor(q/9))*9+q%9;
const wallMirror=WALLS.map(w=>WALLS.findIndex(v=>v.orientation===w.orientation&&v.row===(w.orientation?6-w.row:7-w.row)&&v.col===w.col));
export function transform(a:number,p:Player):number {if(!p)return a;if(a<4)return [2,1,0,3][a];if(a<116)return 4+wallMirror[a-4];return 116+wallMirror[a-116];}
export function geometry(walls:Set<number>,boundary=0,debris:Set<string>=new Set()){
 const blocked=Array.from({length:81},()=>[false,false,false,false]);
 for(const w of walls)for(const [q,k] of WALLS[w].edges){if(debris.has(`${q}:${k}`))continue;blocked[q][k]=true;blocked[neighbor(q,k)][(k+2)%4]=true;}
 for(let r=0;r<9;r++){if(boundary>0){blocked[r*9+boundary][3]=true;blocked[r*9+8-boundary][1]=true;}}
 const routes=(goal:number)=>{const d=Array(81).fill(99),queue=Array.from({length:9-2*boundary},(_,c)=>goal*9+c+boundary);for(const q of queue)d[q]=0;for(let i=0;i<queue.length;i++){const q=queue[i];for(let k=0;k<4;k++){const t=neighbor(q,k);if(t>=0&&!blocked[q][k]&&d[t]===99){d[t]=d[q]+1;queue.push(t);}}}return d;};
 return {blocked,distances:[routes(0),routes(8)]};
}
export class Game {
 readonly id=randomUUID();
 starts:(number|null)[]=[null,null];positions:(number|null)[]=[null,null];inventory=[5,5];walls=new Set<number>();turn:Player;winner:Player|null=null;resetUsed=false;events:{player:Player;kind:string;wall?:number;walls?:number[];boundary?:number;manual?:boolean;debris?:string[]}[]=[];
 trace:{positions:(number|null)[];player:Player|null;action:number|null;removedWalls?:number[];boundary?:number;debris?:{q:number;k:number}[]}[]=[];
 constructor(public first:Player=0){this.turn=first;}
 choose(p:Player,col:number){if(this.starts[p]!==null||!Number.isInteger(col)||col<0||col>8)throw Error('请选择起始行上的位置。');this.starts[p]=(p===0?72:0)+col;this.positions[p]=this.starts[p];if(this.ready)this.trace=[{positions:[...this.positions],player:null,action:null}];}
 get ready(){return this.starts.every(q=>q!==null);}
 legal(p:Player):number[]{if(!this.ready||this.winner!==null||this.turn!==p)return [];const q=this.positions[p]!,out:number[]=[],board=geometry(this.walls);for(let k=0;k<4;k++)if(neighbor(q,k)>=0&&!board.blocked[q][k])out.push(k);if(this.inventory[p]>0)for(let w=0;w<WALLS.length;w++)if(geometry(new Set([...this.walls,w])).distances.every(row=>row.every(d=>d<99)))out.push(w+4);return out;}
 act(p:Player,a:number){if(!Number.isInteger(a)||!this.legal(p).includes(a))throw Error('这个行动不可用。');if(a<4)this.positions[p]=neighbor(this.positions[p]!,a);else{this.walls.add(a-4);this.inventory[p]--;}this.events.push({player:p,kind:a<4?'move':'wall',...(a>=4?{wall:a-4}:{})});this.trace.push({positions:[...this.positions],player:p,action:a});if(Math.floor(this.positions[p]!/9)===(p?8:0))this.winner=p;this.turn=(1-p) as Player;}
 reset(p:Player){if(!this.ready||this.winner!==null||this.turn!==p||p===this.first||this.resetUsed)throw Error('现在不能重置。');this.positions=[...this.starts];this.inventory=[5,5];this.walls.clear();this.events=[];this.trace=[{positions:[...this.positions],player:null,action:null}];this.turn=this.first;this.resetUsed=true;}
 snapshot(p:Player){const cv=(q:number|null)=>q===null?null:p?mirror(q):q;const wall=(w:number)=>p?wallMirror[w]:w;return {gameId:this.id+':'+p,ready:this.ready,chosen:this.starts[p]!==null,position:cv(this.positions[p]),walls:[...this.walls].map(w=>{const id=wall(w);const {orientation,row,col}=WALLS[id];return {id,orientation,row,col,length:3,owned:this.events.some(e=>e.kind==='wall'&&e.wall===w&&e.player===p),opponentOwned:this.events.some(e=>e.kind==='wall'&&e.wall===w&&e.player!==p)};}),legal:this.legal(p).map(a=>transform(a,p)),turn:this.winner!==null?'finished':!this.ready?'setup':this.turn===p?'you':'opponent',winner:this.winner===null?null:this.winner===p?0:1,inventory:this.inventory[p],opponentInventory:this.inventory[1-p],resetAvailable:this.ready&&this.winner===null&&this.turn===p&&p!==this.first&&!this.resetUsed,resetUsed:this.resetUsed,history:this.events.map(e=>({player:e.player===p?0:1,text:(e.player===p?'你':'对手')+(e.kind==='move'?'移动了一步':'建造了一堵墙')})),opponentPosition:this.winner===null?null:cv(this.positions[1-p]),...(this.winner===null?{}:{replay:this.trace.map(t=>({positions:[cv(t.positions[p]),cv(t.positions[1-p])],player:t.player===null?null:t.player===p?0:1,action:t.action===null?null:transform(t.action,p),...(t.boundary===undefined?{}:{boundary:t.boundary}),...(t.removedWalls?{removedWalls:t.removedWalls.map(wall)}:{}),...(t.debris?{debris:t.debris.map(({q,k})=>p?{q:k===2?mirror(neighbor(q,k)):mirror(q),k}:{q,k})}:{})}))})};}
}
