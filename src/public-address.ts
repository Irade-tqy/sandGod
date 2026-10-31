import ipaddr from 'ipaddr.js';
import {isIP} from 'node:net';

// Use at connection time as well as during validation; a hostname can be rebound.
export function isPublicAddress(address:string):boolean {
  if (!isIP(address)) return false;
  const ip=ipaddr.process(address);
  if (ip.range() !== 'unicast') return false;
  if (ip.kind()==='ipv4') {
    const v=ip.toByteArray();
    return !(v[0]===0 || v[0]>=224 || (v[0]===192 && v[1]===0 && v[2]===0));
  }
  // Global unicast only. Special IPv6 prefixes are rejected by ipaddr's ranges.
  return (ip.toByteArray()[0] & 0xe0) === 0x20;
}

export function publicEndpoint(value:string):URL {
  let url:URL;
  try { url=new URL(value); } catch { throw Error('MCP 地址无效'); }
  if (url.protocol!=='https:' || url.username || url.password || url.hash) throw Error('MCP 地址必须是不含凭据的 HTTPS 地址');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  if(hostname==='localhost'||hostname.endsWith('.localhost')||hostname.endsWith('.local'))throw Error('MCP 地址不能指向内网');
  if (isIP(hostname) && !isPublicAddress(hostname)) throw Error('MCP 地址不能指向内网');
  return url;
}
