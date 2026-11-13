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
  let trackedId=sessionStorage.getItem('qiling-submission-id'),watching:string|null=null,generation=0,timer:ReturnType<typeof setTimeout>|undefined;
  function view(session:Session|null){login.hidden=!!session;logout.hidden=!session;form.hidden=!session||!base;if(!session&&watching){generation++;clearTimeout(timer);watching=null;}if(session&&base&&trackedId){watch(trackedId);return;}status.textContent=session?(base?'登录成功，可以提交选手。':'已登录，天梯提交尚未开放。'):allowed?'使用 GitHub 登录天梯。':'请在正式网站或本机 localhost:3000 登录。';}
  void auth.getSession().then(({data,error})=>{if(error)status.textContent='登录失败，请重试。';else view(data.session);}).catch(()=>{status.textContent='登录服务暂时不可用。';});
  auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){trackedId=watching=null;sessionStorage.removeItem('qiling-submission-id');generation++;clearTimeout(timer);}view(session);});
  login.disabled=!allowed;
  if(sessionStorage.getItem('qiling-login-return')==='ladder'){sessionStorage.removeItem('qiling-login-return');document.querySelector<HTMLButtonElement>('[data-tab="ladder"]')?.click();}
  login.onclick=()=>{login.disabled=true;sessionStorage.setItem('qiling-login-return','ladder');void auth.signInWithOAuth({provider:'github',options:{redirectTo:new URL('./',location.href).href}}).then(({error})=>{if(error){status.textContent='无法开始 GitHub 登录。';login.disabled=false;sessionStorage.removeItem('qiling-login-return');}}).catch(()=>{status.textContent='登录服务暂时不可用。';login.disabled=false;sessionStorage.removeItem('qiling-login-return');});};
  logout.onclick=()=>{void auth.signOut().then(({error})=>{if(error)status.textContent='退出登录失败，请重试。';}).catch(()=>{status.textContent='退出登录失败，请重试。';});};
  function updateKind(){const isSource=(form.elements.namedItem('submit-kind') as RadioNodeList).value==='source';document.getElementById('submit-source-field')!.hidden=!isSource;document.getElementById('submit-mcp-field')!.hidden=isSource;endpoint.disabled=isSource;file.disabled=!isSource;file.required=isSource;}
  form.querySelectorAll<HTMLInputElement>('input[name=submit-kind]').forEach(input=>input.onchange=updateKind);updateKind();
  const progressBox=document.getElementById('upload-progress') as HTMLElement,progressBar=document.getElementById('upload-progress-bar') as HTMLProgressElement,progressLabel=document.getElementById('upload-progress-label') as HTMLElement,progressPercent=document.getElementById('upload-progress-percent') as HTMLElement,progressSpeed=document.getElementById('upload-progress-speed') as HTMLElement,progressEta=document.getElementById('upload-progress-eta') as HTMLElement;
  const formatBytes=(value:number)=>value<1024?`${value.toFixed(0)} B`:value<1024*1024?`${(value/1024).toFixed(1)} KB`:`${(value/1024/1024).toFixed(1)} MB`;
  const formatDuration=(seconds:number)=>{if(!Number.isFinite(seconds)||seconds<0)return '预计剩余时间计算中';const rounded=Math.ceil(seconds);return rounded<60?`约 ${rounded} 秒剩余`:`约 ${Math.floor(rounded/60)} 分 ${rounded%60} 秒剩余`;};
  const now=()=>typeof performance==='undefined'?Date.now():performance.now();
  let uploadStarted=0;
  function showUploadProgress(loaded:number,total:number,finished=false){
    if(!progressBox||!progressBar)return;
    const ratio=total>0?Math.max(0,Math.min(1,loaded/total)):0,percent=Math.round(ratio*100),elapsed=uploadStarted?Math.max(.001,(now()-uploadStarted)/1000):0,speed=elapsed?loaded/elapsed:0;
    progressBox.hidden=false;progressBox.classList.toggle('is-complete',finished);progressBox.classList.remove('is-error');progressBar.value=percent;progressPercent.textContent=`${percent}%`;progressLabel.textContent=finished?'上传完成':percent?'正在上传…':'准备上传…';progressSpeed.textContent=speed?`${formatBytes(speed)}/s`:'等待开始';progressEta.textContent=finished?'':formatDuration(speed?(total-loaded)/speed:NaN);
  }
  function failUploadProgress(){if(!progressBox)return;progressBox.hidden=false;progressBox.classList.remove('is-complete');progressBox.classList.add('is-error');progressLabel.textContent='上传失败';progressSpeed.textContent='可以重新提交';progressEta.textContent='';}
  async function request(path:string,session:Session,init:RequestInit={}){
    if(!base)throw Error('天梯提交尚未开放。');
    const response=await fetch(base+path,{...init,redirect:'error',headers:{...init.headers,Authorization:'Bearer '+session.access_token}});
    const result=await response.json().catch(()=>null) as {id?:unknown;state?:unknown;error?:unknown;error_message?:unknown}|null;
    if(!response.ok)throw Error(typeof result?.error==='string'?result.error:'请求失败，请稍后再试。');
    return result;
  }
  function remember(id:string){if(watching!==id){generation++;clearTimeout(timer);watching=null;}trackedId=id;sessionStorage.setItem('qiling-submission-id',id);}
  function uploadSource(path:string,session:Session,bytes:ArrayBuffer,onProgress:(loaded:number,total:number)=>void){
    if(typeof XMLHttpRequest==='undefined')return request(path,session,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});
    return new Promise<{id?:unknown}>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('PUT',base+path);xhr.setRequestHeader('Authorization','Bearer '+session.access_token);xhr.setRequestHeader('Content-Type','application/octet-stream');
      xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded,event.total);};
      xhr.onload=()=>{const result=JSON.parse(xhr.responseText||'null') as {id?:unknown;error?:unknown}|null;if(xhr.status>=200&&xhr.status<300)resolve(result||{});else reject(Error(typeof result?.error==='string'?result.error:'上传失败，请稍后再试。'));};
      xhr.onerror=()=>reject(Error('网络中断，上传状态暂不确定。'));xhr.ontimeout=()=>reject(Error('上传超时，上传状态暂不确定。'));xhr.timeout=10*60*1000;xhr.send(bytes);
    });
  }
  function watch(id:string){if(watching===id)return;watching=id;const current=++generation;clearTimeout(timer);timer=setTimeout(()=>{void poll(id,current);},0);}
  async function poll(id:string,current:number){
    try{
      const session=(await auth.getSession()).data.session;if(!session)return;
      const result=await request('/api/submissions/'+encodeURIComponent(id),session);
      if(current!==generation)return;
      const messages:Record<string,string>={staging:'正在确认上传状态…',pending:'已提交，等待评测…',processing:'正在评测…',accepted:'评测通过，已加入天梯。',rejected:'评测未通过。',error:'评测服务暂时不可用。'};
      const state=String(result?.state||'');status.textContent=messages[state]||'暂时无法读取评测状态。';
      if((state==='rejected'||state==='error')&&typeof result?.error_message==='string')status.textContent+=' '+result.error_message;
      if(state==='accepted')window.dispatchEvent(new Event('qiling-ladder-refresh'));
      if(['staging','pending','processing'].includes(state))timer=setTimeout(()=>{void poll(id,current);},20000);
    }catch{if(current===generation){status.textContent='暂时无法读取评测状态，正在重试…';timer=setTimeout(()=>{void poll(id,current);},30000);}}
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
          if(typeof result?.id!=='string')throw Error('提交暂时不可用。');reservation=result.id;remember(reservation);
          transferStarted=true;uploadStarted=now();showUploadProgress(0,selected.size);result=await uploadSource('/api/submissions/source/'+encodeURIComponent(reservation),session,bytes,(loaded,total)=>showUploadProgress(loaded,total));showUploadProgress(selected.size,selected.size,true);
          reservation=null;
        }else{
          const url=new URL(endpoint.value);if(url.protocol!=='https:')throw Error('请填写公网 HTTPS 地址。');
          result=await request('/api/submissions/mcp',session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,author,endpoint:url.href})});
          endpoint.value='';
        }
        if(typeof result?.id!=='string')throw Error('提交暂时不可用。');
        remember(result.id);status.textContent='已提交，等待评测…';watch(result.id);
      }catch(error){
        if(reservation&&transferStarted){status.textContent='上传状态尚未确定，正在查询…';watch(reservation);return;}
        if(reservation&&!transferStarted){trackedId=null;sessionStorage.removeItem('qiling-submission-id');void request('/api/submissions/source/'+encodeURIComponent(reservation),session,{method:'DELETE'}).catch(()=>{});}
        throw error;
      }
    })().catch(error=>{if(file.files?.length)failUploadProgress();status.textContent=error instanceof Error?error.message:'提交暂时不可用。';}).finally(()=>{button.disabled=false;});
  };
}else{login.disabled=true;status.textContent='登录服务暂时不可用。';}
