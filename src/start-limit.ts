export function startLimiter(){
 const pending=new Map<string,number>();let total=0;
 return (key:string)=>{
  if(total>=8||(pending.get(key)??0)>=2)return null;
  total++;pending.set(key,(pending.get(key)??0)+1);let released=false;
  return ()=>{if(released)return;released=true;total--;const left=(pending.get(key)??1)-1;if(left)pending.set(key,left);else pending.delete(key);};
 };
}
