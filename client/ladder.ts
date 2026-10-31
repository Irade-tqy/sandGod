export {};
const api='https://icmudmlyhkxmiyeqwuvi.supabase.co/rest/v1/arena_players?select=id,name,author_name,kind,mcp_status,rating,matches&status=eq.active&order=rating.desc';
const publishableKey="sb_publishable_VSzDyfevnd1CAiD_8sb6dg_UgnUgree";
type Entry={id:string;name:string;author_name:string;kind:'c'|'cpp'|'mcp';mcp_status:'online'|'offline'|'unchecked'|null;rating:number;matches:number};
async function loadLadder(){
 const board=document.querySelector<HTMLElement>('.leaderboard');if(!board)return;
 const status=document.createElement('p');status.className='ladder-empty';status.textContent='正在读取排行榜…';board.append(status);
 try{
  const response=await fetch(api,{headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey}});
  if(!response.ok)throw Error('无法读取天梯');
  const entries:Entry[]=await response.json();status.textContent=entries.length?'':'暂时还没有通过评测的选手。';
  for(const [index,entry] of entries.entries()){
   const row=document.createElement('div');row.className='ladder-row';
   const identity=document.createElement('div');identity.className='rank-name';
   const rank=document.createElement('b');rank.className='rank'+(index===0?' top-rank':'');rank.textContent=String(index+1).padStart(2,'0');
   const avatar=document.createElement('span');avatar.className='avatar avatar-green';avatar.textContent=entry.name.slice(0,1);
   const labels=document.createElement('span'),name=document.createElement('strong'),author=document.createElement('small');name.textContent=entry.name;author.textContent='by '+entry.author_name;labels.append(name,author);identity.append(rank,avatar,labels);
   const type=document.createElement('span'),badge=document.createElement('em');badge.className='kind'+(entry.kind==='mcp'&&entry.mcp_status==='online'?' online':'');badge.textContent=entry.kind==='mcp'?(entry.mcp_status==='online'?'MCP · 可对战':entry.mcp_status==='offline'?'MCP 离线':'MCP · 尚未检测'):entry.kind.toUpperCase()+' · 仅评测';type.append(badge);
   const matches=document.createElement('span');matches.textContent=String(entry.matches);const rating=document.createElement('strong');rating.className='rating';rating.textContent=Math.round(entry.rating).toLocaleString();row.append(identity,type,matches,rating);board.append(row);
  }
 }catch{status.textContent='排行榜暂时不可用，请稍后重试。';}
}
void loadLadder();

