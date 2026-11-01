import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {SoloGame} from './solo-game';
import {createPublicFetch} from './public-fetch';
import {Choice,LadderPlayer} from './ladder-match';
import {strategyChoice,strategyRequest} from './strategy-protocol';
import {EvaluationInfrastructureError} from './evaluation-errors';

const TIMEOUT=100_000;
function infrastructure(error:unknown){let current=error;for(let i=0;i<6&&current;i++){if(current instanceof EvaluationInfrastructureError)throw current;current=typeof current==='object'&&current!==null?(current as {cause?:unknown}).cause:null;}}

export class McpOpponent implements LadderPlayer {
 private client=new Client({name:'qiling-sandbox',version:'1.0.0'});
 private connection:ReturnType<typeof createPublicFetch>;
 constructor(endpoint:string){this.connection=createPublicFetch(endpoint);}
 async connect(){
  try{
   await this.client.connect(new StreamableHTTPClientTransport(this.connection.url,{fetch:this.connection.fetch}),{timeout:TIMEOUT});
   const tools=await this.client.listTools(undefined,{timeout:TIMEOUT});
   if(!tools.tools.some(tool=>tool.name==='qiling_choose')){await this.close();throw Error('MCP 服务缺少 qiling_choose 工具。');}
  }catch(error){infrastructure(error);throw error;}
 }
 async choose(phase:'weights'|'start'|'action',state:ReturnType<SoloGame['snapshot']>,legalActions:number[]):Promise<Choice>{
  let result:Awaited<ReturnType<typeof this.client.callTool>>;
  try{result=await this.client.callTool({name:'qiling_choose',arguments:strategyRequest(phase,state,legalActions)},undefined,{timeout:TIMEOUT});}catch(error){infrastructure(error);throw error;}
  if(result.isError)throw Error('MCP 玩家返回错误。');
  let data:unknown=result.structuredContent;
  if(!data){const first=Array.isArray(result.content)?result.content.find((item:unknown)=>!!item&&typeof item==='object'&&(item as {type?:unknown}).type==='text'):undefined;if(!first||typeof first.text!=='string')throw Error('MCP 玩家没有返回行动。');try{data=JSON.parse(first.text);}catch{throw Error('MCP 玩家返回了无效 JSON。');}}
  return strategyChoice(data);
 }
 async close(){try{await this.client.close();}finally{await this.connection.close();}}
}
