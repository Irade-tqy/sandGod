import {lookup} from 'node:dns';
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

export function createPublicFetch(endpoint:string) {
  const url=publicEndpoint(endpoint);
  const safeLookup:LookupFunction=(hostname,options,callback)=>{
    lookup(hostname,{all:true,verbatim:true},(error,addresses)=>{
      if (error) return callback(error,'',0);
      if (!addresses.length || addresses.some(item=>!isPublicAddress(item.address))) return callback(new Error('MCP 地址解析到了非公网地址'),'',0);
      if (options.all) return callback(null,addresses);
      return callback(null,addresses[0].address,addresses[0].family);
    });
  };
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
