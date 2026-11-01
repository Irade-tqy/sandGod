import {setTimeout as sleep} from 'node:timers/promises';
import {LadderStore} from './ladder-store';
import {McpOpponent} from './mcp-opponent';
import {processOneMcp} from './mcp-worker';
import {processOneRating} from './rating-worker';

const secret=process.env.SANDGOD_SUPABASE_SECRET_KEY;
if(!secret)throw Error('天梯评测服务未配置数据库密钥');
const store=new LadderStore(secret);
let running=true;
let validateFirst=true;
process.on('SIGTERM',()=>{running=false;});
process.on('SIGINT',()=>{running=false;});
void (async()=>{
  while(running){
    try{
      const make=(endpoint:string)=>new McpOpponent(endpoint);
      const didWork=validateFirst?(await processOneMcp(store,make)||await processOneRating(store,make)):(await processOneRating(store,make)||await processOneMcp(store,make));
      validateFirst=!validateFirst;
      if(!didWork)await sleep(5000);
    }
    catch{console.error('评测队列暂时不可用');await sleep(10000);}
  }
})();
