import {publishableKey} from './auth-config.js';

type Session={access_token:string};
type Auth={getSession():Promise<{data:{session:Session|null};error:unknown}>;onAuthStateChange(callback:(event:string,session:Session|null)=>void):unknown;signInWithOAuth(options:{provider:'github';options:{redirectTo:string}}):Promise<{error:unknown}>;signOut():Promise<{error:unknown}>};
type BrowserClient={auth:Auth};
const config=window as Window & {SANDGOD_GAME_SERVER?:string;SANDGOD_SOURCE_UPLOAD?:boolean;supabase?:{createClient(url:string,key:string,options:object):BrowserClient}};
const login=document.getElementById('ladder-login') as HTMLButtonElement,logout=document.getElementById('ladder-logout') as HTMLButtonElement,form=document.getElementById('submit-form') as HTMLFormElement,status=document.getElementById('submit-status') as HTMLElement;
const button=document.getElementById('submit-button') as HTMLButtonElement,sourceChoice=document.getElementById('submit-source-choice') as HTMLInputElement,endpoint=document.getElementById('submit-endpoint') as HTMLInputElement,file=document.getElementById('submit-file') as HTMLInputElement;
let backend:URL|null=null;
try{const candidate=new URL(config.SANDGOD_GAME_SERVER||'');if(candidate.protocol==='https:'&&!candidate.username&&!candidate.password)backend=candidate;}catch{}
if(config.supabase){
  const base=backend?.origin;
  const auth=config.supabase.createClient('https://icmudmlyhkxmiyeqwuvi.supabase.co',publishableKey,{auth:{storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}}).auth;
  sourceChoice.disabled=!config.SANDGOD_SOURCE_UPLOAD;
  const allowed=location.origin==='http://localhost:3000'||(location.origin==='https://irade-tqy.github.io'&&location.pathname.startsWith('/sandGod/'));
  function view(session:Session|null){login.hidden=!!session;logout.hidden=!session;form.hidden=!session||!base;status.textContent=session?(base?'登录成功，可以提交选手。':'已登录，天梯提交尚未开放。'):allowed?'使用 GitHub 登录天梯。':'请在正式网站或本机 localhost:3000 登录。';}
  void auth.getSession().then(({data,error})=>{if(error)status.textContent='登录失败，请重试。';else view(data.session);}).catch(()=>{status.textContent='登录服务暂时不可用。';});
  auth.onAuthStateChange((_event,session)=>view(session));
  login.disabled=!allowed;
  if(sessionStorage.getItem('qiling-login-return')==='ladder'){sessionStorage.removeItem('qiling-login-return');document.querySelector<HTMLButtonElement>('[data-tab="ladder"]')?.click();}
  login.onclick=()=>{login.disabled=true;sessionStorage.setItem('qiling-login-return','ladder');void auth.signInWithOAuth({provider:'github',options:{redirectTo:new URL('./',location.href).href}}).then(({error})=>{if(error){status.textContent='无法开始 GitHub 登录。';login.disabled=false;sessionStorage.removeItem('qiling-login-return');}}).catch(()=>{status.textContent='登录服务暂时不可用。';login.disabled=false;sessionStorage.removeItem('qiling-login-return');});};
  logout.onclick=()=>{void auth.signOut().then(({error})=>{if(error)status.textContent='退出登录失败，请重试。';}).catch(()=>{status.textContent='退出登录失败，请重试。';});};
  function updateKind(){const isSource=(form.elements.namedItem('submit-kind') as RadioNodeList).value==='source';document.getElementById('submit-source-field')!.hidden=!isSource;document.getElementById('submit-mcp-field')!.hidden=isSource;endpoint.disabled=isSource;file.disabled=!isSource;file.required=isSource;}
  form.querySelectorAll<HTMLInputElement>('input[name=submit-kind]').forEach(input=>input.onchange=updateKind);updateKind();
  async function request(path:string,session:Session,init:RequestInit={}){
    if(!base)throw Error('天梯提交尚未开放。');
    const response=await fetch(base+path,{...init,redirect:'error',headers:{...init.headers,Authorization:'Bearer '+session.access_token}});
    const result=await response.json().catch(()=>null) as {id?:unknown;state?:unknown;error?:unknown;error_message?:unknown}|null;
    if(!response.ok)throw Error(typeof result?.error==='string'?result.error:'请求失败，请稍后再试。');
    return result;
  }
  async function poll(id:string){
    try{
      const session=(await auth.getSession()).data.session;if(!session)return;
      const result=await request('/api/submissions/'+encodeURIComponent(id),session);
      const messages:Record<string,string>={staging:'等待上传源码…',pending:'已提交，等待评测…',processing:'正在评测…',accepted:'评测通过，已加入天梯。',rejected:'评测未通过。',error:'评测服务暂时不可用。'};
      const state=String(result?.state||'');status.textContent=messages[state]||'暂时无法读取评测状态。';
      if((state==='rejected'||state==='error')&&typeof result?.error_message==='string')status.textContent+=' '+result.error_message;
      if(state==='accepted')window.dispatchEvent(new Event('qiling-ladder-refresh'));
      if(['staging','pending','processing'].includes(state))setTimeout(()=>{void poll(id);},20000);
    }catch{status.textContent='暂时无法读取评测状态，请稍后重试。';}
  }
  form.onsubmit=event=>{
    event.preventDefault();button.disabled=true;
    void (async()=>{
      let reservation:string|null=null,transferStarted=false;const session=(await auth.getSession()).data.session;if(!session)throw Error('请先登录。');
      const name=(document.getElementById('submit-name') as HTMLInputElement).value.trim(),author=(document.getElementById('submit-author') as HTMLInputElement).value.trim();
      const kind=(form.elements.namedItem('submit-kind') as RadioNodeList).value;
      try{
        let result:{id?:unknown}|null;
        if(kind==='source'){
          const selected=file.files?.[0];if(!selected||selected.size<1||selected.size>10*1024*1024)throw Error('请选择不超过 10 MiB 的源码文件。');
          const bytes=await selected.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
          result=await request('/api/submissions/source',session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,author,filename:selected.name,sha256:digest,size:selected.size})});
          if(typeof result?.id!=='string')throw Error('提交暂时不可用。');reservation=result.id;
          transferStarted=true;result=await request('/api/submissions/source/'+encodeURIComponent(reservation),session,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});
          reservation=null;
        }else{
          const url=new URL(endpoint.value);if(url.protocol!=='https:')throw Error('请填写公网 HTTPS 地址。');
          result=await request('/api/submissions/mcp',session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,author,endpoint:url.href})});
          endpoint.value='';
        }
        if(typeof result?.id!=='string')throw Error('提交暂时不可用。');
        status.textContent='已提交，等待评测…';void poll(result.id);
      }catch(error){
        if(reservation&&!transferStarted)void request('/api/submissions/source/'+encodeURIComponent(reservation),session,{method:'DELETE'}).catch(()=>{});
        throw error;
      }
    })().catch(error=>{status.textContent=error instanceof Error?error.message:'提交暂时不可用。';}).finally(()=>{button.disabled=false;});
  };
}else{login.disabled=true;status.textContent='登录服务暂时不可用。';}
