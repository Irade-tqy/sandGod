const ORIGIN='https://icmudmlyhkxmiyeqwuvi.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LadderStore {
  constructor(private readonly secret:string){if(!secret)throw Error('天梯服务未配置数据库密钥');}
  private async request(path:string,options:RequestInit={}){
    const response=await fetch(ORIGIN+path,{...options,redirect:'error',headers:{apikey:this.secret,Authorization:'Bearer '+this.secret,'Content-Type':'application/json',Prefer:'return=representation'}});
    if(!response.ok){
      const error=await response.json().catch(()=>null) as {message?:unknown}|null;
      const messages:Record<string,string>={'queue full':'评测队列已满，请稍后再试','daily quota exceeded':'今天的提交次数已用完','submission already pending':'请等待上一次提交完成'};
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
    if(row.id!==id||!['pending','processing','accepted','rejected'].includes(String(row.state)))throw Error('提交记录无效');
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
}
