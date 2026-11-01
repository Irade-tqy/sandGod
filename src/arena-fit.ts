// Regularized Bradley–Terry fit over completed ladder matches.
export type FitMatch = {first:string; second:string; winner:string|null; count?:number};
export type FitResult = {id:string; rating:number; lower:number|null; upper:number|null; matches:number};

function solve(a:number[][], b:number[]):number[] {
 const n=b.length,m=a.map((row,i)=>[...row,b[i]]);
 for(let i=0;i<n;i++){
  let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
  if(Math.abs(m[pivot][i])<1e-12)throw Error('评分矩阵不可逆');
  [m[i],m[pivot]]=[m[pivot],m[i]];const d=m[i][i];for(let k=i;k<=n;k++)m[i][k]/=d;
  for(let j=0;j<n;j++)if(j!==i){const f=m[j][i];for(let k=i;k<=n;k++)m[j][k]-=f*m[i][k];}
 }
 return m.map(row=>row[n]);
}

export function fitArena(ids:string[], games:FitMatch[]):FitResult[] {
 if(new Set(ids).size!==ids.length)throw Error('重复选手');
 const n=ids.length;if(!n)return [];const index=new Map(ids.map((id,i)=>[id,i]));
 const pairs=games.map(g=>{const a=index.get(g.first),b=index.get(g.second),quantity=g.count??1;if(a===undefined||b===undefined||a===b||!Number.isSafeInteger(quantity)||quantity<1||(g.winner!==null&&g.winner!==g.first&&g.winner!==g.second))throw Error('无效对局');return {a,b,quantity,y:g.winner===null?.5:Number(g.winner===g.first)};});
 const count=Array(n).fill(0),forward=Array.from({length:n},()=>new Set<number>()),backward=Array.from({length:n},()=>new Set<number>()),pairCounts=new Map<string,number>();
 for(const p of pairs){count[p.a]+=p.quantity;count[p.b]+=p.quantity;if(p.y>0){forward[p.a].add(p.b);backward[p.b].add(p.a);}if(p.y<1){forward[p.b].add(p.a);backward[p.a].add(p.b);}const key=[Math.min(p.a,p.b),Math.max(p.a,p.b)].join(':');pairCounts.set(key,(pairCounts.get(key)||0)+p.quantity);}
 const weight=(a:number,b:number)=>50/Math.max(50,pairCounts.get([Math.min(a,b),Math.max(a,b)].join(':'))!);
 const start=count.findIndex(x=>x>0),played=count.filter(x=>x>0).length;
 const reachable=(edges:Set<number>[])=>{const reached=new Set<number>(),pending=start<0?[]:[start];if(start>=0)reached.add(start);while(pending.length){for(const next of edges[pending.pop()!])if(!reached.has(next)){reached.add(next);pending.push(next);}}return reached.size;};
 const connected=played>1&&reachable(forward)===played&&reachable(backward)===played;
 const regularization=connected?1e-6:.25,scale=400/Math.log(10),s=Array(n).fill(0);
 let h:number[][]=[];
 for(let iteration=0;iteration<100;iteration++){
  h=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?regularization:0));
  const gradient=s.map(x=>-regularization*x);
  for(const p of pairs){const probability=1/(1+Math.exp(Math.max(-30,Math.min(30,s[p.b]-s[p.a]))));const factor=weight(p.a,p.b)*p.quantity,residual=(p.y-probability)*factor,w=probability*(1-probability)*factor;gradient[p.a]+=residual;gradient[p.b]-=residual;h[p.a][p.a]+=w;h[p.b][p.b]+=w;h[p.a][p.b]-=w;h[p.b][p.a]-=w;}
  const step=solve(h,gradient),damping=Math.max(1,...step.map(x=>Math.abs(x)/2));let biggest=0;for(let i=0;i<n;i++){s[i]+=step[i]/damping;biggest=Math.max(biggest,Math.abs(step[i]/damping));}
  if(biggest<1e-8)break;if(iteration===99)throw Error('评分拟合未收敛');
 }
 const inverse=Array.from({length:n},(_,i)=>solve(h,Array.from({length:n},(_,j)=>Number(i===j))));
 const mean=s.reduce((a,b)=>a+b,0)/n;
 return ids.map((id,i)=>{let variance=0;for(const p of pairs){const probability=1/(1+Math.exp(Math.max(-30,Math.min(30,s[p.b]-s[p.a])))),influence=(inverse[i][p.a]-inverse[i][p.b])*(p.y-probability)*weight(p.a,p.b);variance+=p.quantity*influence*influence;}const rating=1500+scale*(s[i]-mean),margin=1.96*scale*Math.sqrt(variance),reliable=connected&&count[i]>0&&variance>1e-12;return{id,rating,lower:reliable?rating-margin:null,upper:reliable?rating+margin:null,matches:count[i]};});
}
