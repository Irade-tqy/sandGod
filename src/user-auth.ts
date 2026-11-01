const AUTH_URL='https://icmudmlyhkxmiyeqwuvi.supabase.co/auth/v1/user';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifiedUser(authorization:string|undefined,secret:string):Promise<string|null>{
  if(!authorization||authorization.length>8192||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return null;
  const response=await fetch(AUTH_URL,{headers:{apikey:secret,Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status===401||response.status===403)return null;
  if(!response.ok)throw Error('登录服务暂时不可用');
  const user=await response.json() as {id?:unknown;is_anonymous?:unknown};
  return typeof user.id==='string'&&UUID.test(user.id)&&user.is_anonymous!==true?user.id:null;
}
