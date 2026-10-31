import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {SoloGame} from './solo-game';
import {createPublicFetch} from './public-fetch';
import {Choice,LadderPlayer} from './ladder-match';

const RULES='启灵沙盘：各方先选择起始行位置及上右下左的移动概率，各概率为至少1%的整数且总和100%。墙的数量不限，每回合放一堵墙或拆除一堵自己的墙，然后按可走方向概率归一化随机走一步；任何一方单独放的墙都必须保持棋盘连通，双方的墙合起来可以切断棋盘。后手可在一回合选择一次自主走一步。每20完整回合缩去左右各一列、将该列棋子移入内侧并删除不再容纳的墙；单列时不能放墙，继续随机移动。先到对岸获胜。';
const TIMEOUT=100_000;

export class McpOpponent implements LadderPlayer {
 private client=new Client({name:'qiling-sandbox',version:'1.0.0'});
 private connection:ReturnType<typeof createPublicFetch>;
 constructor(endpoint:string){this.connection=createPublicFetch(endpoint);}
 async connect(){
  await this.client.connect(new StreamableHTTPClientTransport(this.connection.url,{fetch:this.connection.fetch}),{timeout:TIMEOUT});
  const tools=await this.client.listTools(undefined,{timeout:TIMEOUT});
  if(!tools.tools.some(tool=>tool.name==='qiling_choose')){await this.close();throw Error('MCP 服务缺少 qiling_choose 工具。');}
 }
 async choose(phase:'weights'|'start'|'action',state:ReturnType<SoloGame['snapshot']>,legalActions:number[]):Promise<Choice>{
  const result=await this.client.callTool({name:'qiling_choose',arguments:{phase,rules:RULES,state,legalActions}},undefined,{timeout:TIMEOUT});
  if(result.isError)throw Error('MCP 玩家返回错误。');
  let data:unknown=result.structuredContent;
  if(!data){const first=Array.isArray(result.content)?result.content.find((item:unknown)=>!!item&&typeof item==='object'&&(item as {type?:unknown}).type==='text'):undefined;if(!first||typeof first.text!=='string')throw Error('MCP 玩家没有返回行动。');try{data=JSON.parse(first.text);}catch{throw Error('MCP 玩家返回了无效 JSON。');}}
  if(!data||typeof data!=='object')throw Error('MCP 玩家返回了无效行动。');
  return data as {action?:number;col?:number;weights?:number[]};
 }
 async close(){try{await this.client.close();}finally{await this.connection.close();}}
}
