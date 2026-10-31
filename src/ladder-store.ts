const ORIGIN='https://icmudmlyhkxmiyeqwuvi.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LadderStore {
  constructor(private readonly secret:string){if(!secret)throw Error('天梯服务未配置数据库密钥');}
  private async request(path:string,options:RequestInit={}){
    const response=await fetch(ORIGIN+path,{...options,redirect:'error',headers:{apikey:this.secret,Authorization:'Bearer '+this.secret,'Content-Type':'application/json',Prefer:'return=representation'}});
    if(!response.ok)throw Error('天梯数据库暂时不可用');
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
}
