const ORIGIN='https://icmudmlyhkxmiyeqwuvi.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PlayerSource={kind:'mcp';endpoint:string}|{kind:'wasm';id:string;sha256:string}|{kind:'reference'};

export class LadderStore {
  constructor(private readonly secret:string){if(!secret)throw Error('天梯服务未配置数据库密钥');}
  private async request(path:string,options:RequestInit={}){
    const timeout=AbortSignal.timeout(10000);
    const response=await fetch(ORIGIN+path,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,timeout]):timeout,headers:{apikey:this.secret,'Content-Type':'application/json',Prefer:'return=representation'}});
    if(!response.ok){
      const error=await response.json().catch(()=>null) as {message?:unknown}|null;
      const messages:Record<string,string>={'queue full':'评测队列已满，请稍后再试','storage full':'源码暂存空间已满，请稍后再试'};
      const rateLimit=typeof error?.message==='string'?/^submission rate limit:(\d+)$/.exec(error.message):null;
      if(rateLimit){const seconds=Number(rateLimit[1]);if(Number.isInteger(seconds)&&seconds>=1&&seconds<=300)throw Error(`submission rate limit:${seconds}`);}
      throw Error(typeof error?.message==='string'&&messages[error.message]?messages[error.message]:'天梯数据库暂时不可用');
    }
    if(response.status===204)return null;
    return await response.json() as unknown;
  }
  async getActiveMcp(id:string):Promise<{id:string;endpoint:string}|null>{
    if(!UUID.test(id))return null;
    const result=await this.request('/rest/v1/arena_worker_endpoints?select=id,endpoint&id=eq.'+id+'&order=created_at.desc&limit=1');
    if(!Array.isArray(result)||result.length===0)return null;
    const row=result[0] as {id?:unknown;endpoint?:unknown};
    return row.id===id&&typeof row.endpoint==='string'?{id,endpoint:row.endpoint}:null;
  }
  async setMcpStatus(id:string,status:'online'|'offline'){
    if(!UUID.test(id)||!['online','offline'].includes(status))throw Error('天梯请求无效');
    const result=await this.request('/rest/v1/arena_players?id=eq.'+id+'&status=eq.active&kind=eq.mcp',{method:'PATCH',body:JSON.stringify({mcp_status:status})});
    if(!Array.isArray(result)||result.length!==1)throw Error('天梯选手不可用');
  }
  async recordMatch(matchId:string,first:string,second:string,winner:string){
    if(![matchId,first,second,winner].every(id=>UUID.test(id))||first===second||(winner!==first&&winner!==second))throw Error('天梯对局结果无效');
    await this.request('/rest/v1/rpc/arena_record_match',{method:'POST',body:JSON.stringify({p_match_id:matchId,p_first:first,p_second:second,p_winner:winner})});
  }
  async enqueueMcp(owner:string,name:string,author:string,endpoint:string):Promise<string>{
    if(!UUID.test(owner))throw Error('登录状态无效');
    const id=await this.request('/rest/v1/rpc/arena_enqueue_mcp',{method:'POST',body:JSON.stringify({p_owner:owner,p_name:name,p_author:author,p_endpoint:endpoint})});
    if(typeof id!=='string'||!UUID.test(id))throw Error('提交暂时不可用');
    return id;
  }
  async getSubmission(id:string,owner:string){
    if(!UUID.test(id)||!UUID.test(owner))return null;
    const rows=await this.request('/rest/v1/arena_submission_status?select=id,player_id,state,error_message,created_at&id=eq.'+id+'&owner_id=eq.'+owner+'&limit=1');
    if(!Array.isArray(rows)||rows.length!==1)return null;
    const row=rows[0] as {id?:unknown;player_id?:unknown;state?:unknown;error_message?:unknown;created_at?:unknown};
    if(row.id!==id||!['staging','pending','processing','accepted','rejected','error'].includes(String(row.state)))throw Error('提交记录无效');
    return {id:row.id,player_id:row.player_id,state:row.state,error_message:row.error_message,created_at:row.created_at};
  }
  async claimMcp(token:string){
    if(!UUID.test(token))throw Error('评测请求无效');
    const rows=await this.request('/rest/v1/rpc/arena_claim_mcp',{method:'POST',body:JSON.stringify({p_token:token})});
    if(!Array.isArray(rows))throw Error('评测队列暂时不可用');
    if(!rows.length)return null;
    const row=rows[0] as {submission_id?:unknown;player_id?:unknown;endpoint?:unknown};
    if(rows.length!==1||typeof row.submission_id!=='string'||!UUID.test(row.submission_id)||typeof row.player_id!=='string'||!UUID.test(row.player_id)||typeof row.endpoint!=='string')throw Error('评测任务无效');
    return {submissionId:row.submission_id,playerId:row.player_id,endpoint:row.endpoint};
  }
  async finishMcp(id:string,token:string,accepted:boolean,error:string|null){
    if(!UUID.test(id)||!UUID.test(token)||typeof accepted!=='boolean'||(error!==null&&(typeof error!=='string'||error.length>240)))throw Error('评测结果无效');
    return await this.request('/rest/v1/rpc/arena_finish_mcp',{method:'POST',body:JSON.stringify({p_submission:id,p_token:token,p_accepted:accepted,p_error:error})})===true;
  }
  async claimRating(token:string){
    if(!UUID.test(token))throw Error('评测请求无效');
    const rows=await this.request('/rest/v1/rpc/arena_claim_rating',{method:'POST',body:JSON.stringify({p_token:token})});
    if(!Array.isArray(rows))throw Error('评测队列暂时不可用');
    if(!rows.length)return null;
    const row=rows[0] as {job_id?:unknown;first_player?:unknown;second_player?:unknown};
    if(rows.length!==1||typeof row.job_id!=='string'||!UUID.test(row.job_id)||typeof row.first_player!=='string'||!UUID.test(row.first_player)||typeof row.second_player!=='string'||!UUID.test(row.second_player)||row.first_player===row.second_player)throw Error('评测任务无效');
    return {jobId:row.job_id,first:row.first_player,second:row.second_player};
  }
  async finishRating(id:string,token:string,winner:string|null,completed:boolean){
    if(!UUID.test(id)||!UUID.test(token)||(winner!==null&&!UUID.test(winner))||typeof completed!=='boolean'||(completed&&winner===null))throw Error('评测结果无效');
    return await this.request('/rest/v1/rpc/arena_finish_rating',{method:'POST',body:JSON.stringify({p_job:id,p_token:token,p_winner:winner,p_completed:completed})})===true;
  }
  async reserveSource(owner:string,name:string,author:string,kind:'c'|'cpp',sha256:string,size:number){
    if(!UUID.test(owner)||!['c','cpp'].includes(kind)||!/^[0-9a-f]{64}$/.test(sha256)||!Number.isInteger(size)||size<1||size>10485760)throw Error('提交信息无效');
    const rows=await this.request('/rest/v1/rpc/arena_reserve_source',{method:'POST',body:JSON.stringify({p_owner:owner,p_name:name,p_author:author,p_kind:kind,p_sha256:sha256,p_size:size})});
    if(!Array.isArray(rows)||rows.length!==1)throw Error('提交暂时不可用');
    const row=rows[0] as {submission_id?:unknown;source_path?:unknown};
    if(typeof row.submission_id!=='string'||!UUID.test(row.submission_id)||row.source_path!==`pending/${owner}/${row.submission_id}.${kind}`)throw Error('提交信息无效');
    return {id:row.submission_id,path:row.source_path};
  }
  async sourceStaging(id:string,owner:string){
    if(!UUID.test(id)||!UUID.test(owner))return null;
    const rows=await this.request('/rest/v1/arena_source_staging?select=id,owner_id,source_path,source_sha256,source_size,kind&id=eq.'+id+'&owner_id=eq.'+owner+'&limit=1');
    if(!Array.isArray(rows)||!rows.length)return null;
    const row=rows[0] as {id?:unknown;owner_id?:unknown;source_path?:unknown;source_sha256?:unknown;source_size?:unknown;kind?:unknown};
    if(rows.length!==1||row.id!==id||row.owner_id!==owner||(row.kind!=='c'&&row.kind!=='cpp')||row.source_path!==`pending/${owner}/${id}.${row.kind}`||typeof row.source_sha256!=='string'||!/^[0-9a-f]{64}$/.test(row.source_sha256)||typeof row.source_size!=='number'||!Number.isInteger(row.source_size)||row.source_size<1||row.source_size>10485760)throw Error('提交记录无效');
    return {id,path:row.source_path,sha256:row.source_sha256,size:row.source_size,kind:row.kind as 'c'|'cpp'};
  }
  async publishSource(id:string,owner:string){
    if(!UUID.test(id)||!UUID.test(owner))throw Error('提交信息无效');
    return await this.request('/rest/v1/rpc/arena_publish_source',{method:'POST',body:JSON.stringify({p_submission:id,p_owner:owner})})===true;
  }
  async cancelSource(id:string,owner:string){
    if(!UUID.test(id)||!UUID.test(owner))throw Error('提交信息无效');
    return await this.request('/rest/v1/rpc/arena_cancel_source',{method:'POST',body:JSON.stringify({p_submission:id,p_owner:owner})})===true;
  }
  async claimCleanup(token:string){
    if(!UUID.test(token))throw Error('清理请求无效');
    const rows=await this.request('/rest/v1/rpc/arena_claim_cleanup',{method:'POST',body:JSON.stringify({p_token:token})});
    if(!Array.isArray(rows))throw Error('清理队列不可用');
    if(!rows.length)return null;
    const row=rows[0] as {submission_id?:unknown;source_path?:unknown};
    if(rows.length!==1||typeof row.submission_id!=='string'||!UUID.test(row.submission_id)||typeof row.source_path!=='string'||!/^pending\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(c|cpp)$/i.test(row.source_path))throw Error('清理任务无效');
    return {id:row.submission_id,path:row.source_path};
  }
  async finishCleanup(id:string,token:string,deleted:boolean){
    if(!UUID.test(id)||!UUID.test(token)||typeof deleted!=='boolean')throw Error('清理结果无效');
    return await this.request('/rest/v1/rpc/arena_finish_cleanup',{method:'POST',body:JSON.stringify({p_submission:id,p_token:token,p_deleted:deleted})})===true;
  }
  async claimSource(token:string){
    if(!UUID.test(token))throw Error('评测请求无效');
    const rows=await this.request('/rest/v1/rpc/arena_claim_source',{method:'POST',body:JSON.stringify({p_token:token})});
    if(!Array.isArray(rows))throw Error('评测队列暂时不可用');
    if(!rows.length)return null;
    const row=rows[0] as {submission_id?:unknown;player_id?:unknown;source_path?:unknown;source_sha256?:unknown;source_size?:unknown;kind?:unknown};
    if(rows.length!==1||typeof row.submission_id!=='string'||!UUID.test(row.submission_id)||typeof row.player_id!=='string'||!UUID.test(row.player_id)||(row.kind!=='c'&&row.kind!=='cpp')||typeof row.source_path!=='string'||!new RegExp('^pending/[0-9a-f-]{36}/'+row.submission_id+'\\.'+row.kind+'$','i').test(row.source_path)||typeof row.source_sha256!=='string'||!/^[0-9a-f]{64}$/.test(row.source_sha256)||typeof row.source_size!=='number'||!Number.isInteger(row.source_size)||row.source_size<1||row.source_size>10485760)throw Error('评测任务无效');
    return {submissionId:row.submission_id,playerId:row.player_id,path:row.source_path,sha256:row.source_sha256,size:row.source_size,kind:row.kind as 'c'|'cpp'};
  }
  async finishSource(id:string,token:string,accepted:boolean,artifactSha256:string|null,error:string|null){
    if(!UUID.test(id)||!UUID.test(token)||typeof accepted!=='boolean'||(accepted&&(artifactSha256===null||!/^[0-9a-f]{64}$/.test(artifactSha256)))||(error!==null&&(typeof error!=='string'||error.length>240)))throw Error('评测结果无效');
    return await this.request('/rest/v1/rpc/arena_finish_source',{method:'POST',body:JSON.stringify({p_submission:id,p_token:token,p_accepted:accepted,p_artifact_sha256:artifactSha256,p_error:error})})===true;
  }
  async getActivePlayer(id:string):Promise<PlayerSource|null>{
    if(!UUID.test(id))return null;
    const rows=await this.request('/rest/v1/arena_worker_players?select=id,kind,endpoint,artifact_id,artifact_sha256&id=eq.'+id+'&order=created_at.desc&limit=1');
    if(!Array.isArray(rows)||!rows.length)return null;
    const row=rows[0] as {id?:unknown;kind?:unknown;endpoint?:unknown;artifact_id?:unknown;artifact_sha256?:unknown};
    if(rows.length!==1||row.id!==id)throw Error('天梯选手无效');
    if(row.kind==='reference')return {kind:'reference'};
    if(row.kind==='mcp'&&typeof row.endpoint==='string')return {kind:'mcp' as const,endpoint:row.endpoint};
    if((row.kind==='c'||row.kind==='cpp')&&typeof row.artifact_id==='string'&&UUID.test(row.artifact_id)&&typeof row.artifact_sha256==='string'&&/^[0-9a-f]{64}$/.test(row.artifact_sha256))return {kind:'wasm' as const,id:row.artifact_id,sha256:row.artifact_sha256};
    throw Error('天梯选手无效');
  }
}
