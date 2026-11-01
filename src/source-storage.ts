import {createClient} from '@supabase/supabase-js';
import {MAX_SUBMISSION_BYTES} from './ladder-submission';

const ORIGIN='https://icmudmlyhkxmiyeqwuvi.supabase.co';
const PATH=/^pending\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(c|cpp)$/i;

export class SourceStorage {
  private client;
  constructor(secret:string){
    if(!secret)throw Error('源码存储未配置');
    const guardedFetch:typeof fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      if(url.origin!==ORIGIN)throw Error('存储地址无效');
      const timeout=AbortSignal.timeout(30000);
      const signal=init?.signal?AbortSignal.any([init.signal,timeout]):timeout;
      const headers=new Headers(init?.headers);
      if(secret.startsWith('sb_secret_')&&headers.get('authorization')==='Bearer '+secret)headers.delete('authorization');
      return fetch(input,{...init,headers,redirect:'error',signal});
    };
    this.client=createClient(ORIGIN,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:guardedFetch}});
  }
  async upload(path:string,source:Uint8Array){
    if(!PATH.test(path)||!(source instanceof Uint8Array)||source.length<1||source.length>MAX_SUBMISSION_BYTES)throw Error('源码无效');
    const {error}=await this.client.storage.from('arena-submissions').upload(path,Buffer.from(source),{contentType:'text/plain; charset=utf-8',upsert:false});
    if(error)throw Error('源码上传失败');
  }
  async download(path:string):Promise<Buffer>{
    if(!PATH.test(path))throw Error('源码地址无效');
    const {data,error}=await this.client.storage.from('arena-submissions').download(path);
    if(error||!data||data.size<1||data.size>MAX_SUBMISSION_BYTES)throw Error('源码读取失败');
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(path:string){
    if(!PATH.test(path))throw Error('源码地址无效');
    const {error}=await this.client.storage.from('arena-submissions').remove([path]);
    if(error)throw Error('源码清理失败');
  }
}
