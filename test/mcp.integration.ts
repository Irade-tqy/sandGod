import assert from 'node:assert/strict';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMcpExpressApp} from '@modelcontextprotocol/sdk/server/express.js';
import * as z from 'zod/v4';
import {McpOpponent} from '../src/mcp-opponent';
import {playLadderMatch} from '../src/ladder-match';
import {referencePlayer} from '../src/reference-player';

void (async()=>{
  const app=createMcpExpressApp();
  app.post('/mcp',async(req,res)=>{
    const server=new McpServer({name:'integration-player',version:'1.0.0'});
    server.registerTool('qiling_choose',{inputSchema:{phase:z.enum(['weights','start','action']),rules:z.string(),state:z.unknown(),legalActions:z.array(z.number())}},async({phase,state,legalActions})=>{
      assert.equal((state as {opponentPosition:unknown}).opponentPosition,null);
      const answer=phase==='weights'?{weights:[25,25,25,25]}:phase==='start'?{col:4}:{action:legalActions[0]};
      return {content:[{type:'text',text:JSON.stringify(answer)}]};
    });
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    res.on('close',()=>{void transport.close();void server.close();});
    await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('测试端口无效');
  const endpoint='http://127.0.0.1:'+address.port+'/mcp';
  const player=new McpOpponent(endpoint,()=>({url:new URL(endpoint),fetch:globalThis.fetch,close:async()=>{}}));
  try{
    await player.connect();
    const result=await playLadderMatch([player,referencePlayer],()=>0.1);
    assert.ok(result.winner===0||result.winner===1);
    console.log('MCP 对局和隐藏信息检查通过：',result.actions,'次行动');
  }finally{await player.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
})().catch(error=>{console.error(error);process.exitCode=1;});
