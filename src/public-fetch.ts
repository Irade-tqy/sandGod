import {LookupAddress} from 'node:dns';
import {LookupFunction} from 'node:net';
import {Agent,fetch as undiciFetch} from 'undici';
import {isPublicAddress,publicEndpoint} from './public-address';

export function limitResponse(response:Response):Response {
  if (!response.body) return response;
  let bytes=0;
  const limited=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){
    bytes+=chunk.byteLength;
    if(bytes>1024*1024) throw Error('MCP 响应超过 1 MiB');
    controller.enqueue(chunk);
  }}));
  return new Response(limited,{status:response.status,statusText:response.statusText,headers:response.headers});
}

type ResolveAll=(hostname:string,callback:(error:NodeJS.ErrnoException|null,addresses:LookupAddress[])=>void)=>void;
export async function resolvePublicDns(hostname:string,fetcher:typeof fetch=globalThis.fetch):Promise<LookupAddress[]> {
  const query=async(type:1|28)=>{
    const url=new URL('https://1.1.1.1/dns-query');url.searchParams.set('name',hostname);url.searchParams.set('type',String(type));
    const response=await fetcher(url,{headers:{accept:'application/dns-json'},redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('公网 DNS 不可用');
    const data=await limitResponse(response).json() as {Status?:unknown;Answer?:unknown};
    if(data.Status!==0 || (data.Answer!==undefined&&!Array.isArray(data.Answer)))throw Error('公网 DNS 查询失败');
    return ((data.Answer??[]) as {type?:unknown;data?:unknown}[]).filter(item=>item.type===type&&typeof item.data==='string').map(item=>({address:item.data as string,family:type===1?4:6}));
  };
  return (await Promise.all([query(1),query(28)])).flat();
}

export function createSafeLookup(resolve:ResolveAll=(hostname,callback)=>{void resolvePublicDns(hostname).then(addresses=>callback(null,addresses),error=>callback(error instanceof Error?error:Error('公网 DNS 查询失败'),[]));}):LookupFunction {
  return (hostname,options,callback)=>{
    resolve(hostname,(error,addresses)=>{
      if (error) return callback(error,'',0);
      if (!addresses.length || addresses.some(item=>!isPublicAddress(item.address))) return callback(new Error('MCP 地址解析到了非公网地址'),'',0);
      const selected=options.family?addresses.filter(item=>item.family===options.family):addresses;
      if(!selected.length)return callback(new Error('没有可用的公网地址'),'',0);
      if (options.all) return callback(null,selected);
      return callback(null,selected[0].address,selected[0].family);
    });
  };
}

export function createPublicFetch(endpoint:string) {
  const url=publicEndpoint(endpoint);
  const safeLookup=createSafeLookup();
  const agent=new Agent({connect:{lookup:safeLookup},autoSelectFamily:false});
  const fetcher:typeof globalThis.fetch=async(input,init)=>{
    if (input instanceof Request) throw Error('不支持 Request 对象');
    const target=new URL(typeof input==='string'?input:input.href);
    if (target.origin!==url.origin) throw Error('MCP 请求不能跳转到其他地址');
    const response=await undiciFetch(target,{...init,redirect:'error',dispatcher:agent} as unknown as Parameters<typeof undiciFetch>[1]);
    return limitResponse(response as unknown as Response);
  };
  return {url,fetch:fetcher,close:()=>agent.close()};
}
