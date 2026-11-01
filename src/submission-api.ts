import express from 'express';
import {rateLimit} from 'express-rate-limit';
import {publicEndpoint} from './public-address';

type Store={enqueueMcp(owner:string,name:string,author:string,endpoint:string):Promise<string>;getSubmission(id:string,owner:string):Promise<unknown>};
type Verify=(authorization:string|undefined)=>Promise<string|null>;
const knownErrors=new Set(['评测队列已满，请稍后再试','今天的提交次数已用完','请等待上一次提交完成']);

export function submissionApi(store:Store,verify:Verify,origin:string){
  const router=express.Router();
  router.use((req,res,next)=>{
    if(req.headers.origin!==origin)return res.status(403).json({error:'来源不允许'});
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    if(req.method==='OPTIONS')return res.sendStatus(204);
    next();
  });
  router.use(rateLimit({windowMs:10*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'请求过于频繁，请稍后再试'}}));
  router.use(express.json({limit:'8kb',strict:true}));
  router.post('/submissions/mcp',async(req,res)=>{
    try{
      const owner=await verify(req.headers.authorization);if(!owner)return res.status(401).json({error:'请先登录'});
      const {name,author,endpoint}=req.body??{};
      if(typeof name!=='string'||typeof author!=='string'||typeof endpoint!=='string'||!name.trim()||!author.trim()||name.length>60||author.length>60||endpoint.length>2048||/[\u0000-\u001f\u007f]/.test(name+author))return res.status(400).json({error:'请填写有效的选手名、作者名和 MCP 地址'});
      let url:URL;try{url=publicEndpoint(endpoint);}catch{return res.status(400).json({error:'请填写有效的公网 HTTPS MCP 地址'});}
      const id=await store.enqueueMcp(owner,name.trim(),author.trim(),url.href);
      return res.status(202).json({id});
    }catch(error){const message=error instanceof Error?error.message:'';return res.status(knownErrors.has(message)?429:503).json({error:knownErrors.has(message)?message:'提交暂时不可用'});}
  });
  router.get('/submissions/:id',async(req,res)=>{
    try{
      const owner=await verify(req.headers.authorization);if(!owner)return res.status(401).json({error:'请先登录'});
      const result=await store.getSubmission(req.params.id,owner);
      return result?res.json(result):res.status(404).json({error:'未找到提交'});
    }catch{return res.status(503).json({error:'暂时无法查询提交'});}
  });
  router.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const type=(error as {type?:unknown})?.type;
    return res.status(type==='entity.too.large'?413:400).json({error:type==='entity.too.large'?'提交内容过大':'请求格式无效'});
  });
  return router;
}
