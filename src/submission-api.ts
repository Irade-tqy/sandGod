import express from 'express';
import {rateLimit} from 'express-rate-limit';
import {publicEndpoint} from './public-address';
import {createHash} from 'node:crypto';
import {MAX_SUBMISSION_BYTES,sourceLanguage,validateSourceSubmission} from './ladder-submission';

type Store={enqueueMcp(owner:string,name:string,author:string,endpoint:string):Promise<string>;getSubmission(id:string,owner:string):Promise<unknown>};
type Verify=(authorization:string|undefined)=>Promise<string|null>;
type SourceServices={reserveSource(owner:string,name:string,author:string,kind:'c'|'cpp',sha256:string,size:number):Promise<{id:string;path:string}>;sourceStaging(id:string,owner:string):Promise<{id:string;path:string;sha256:string;size:number;kind:'c'|'cpp'}|null>;publishSource(id:string,owner:string):Promise<boolean>;cancelSource(id:string,owner:string):Promise<boolean>;upload(path:string,source:Uint8Array):Promise<void>};
const knownErrors=new Set(['评测队列已满，请稍后再试','源码暂存空间已满，请稍后再试','今天的提交次数已用完','请等待上一次提交完成']);

export function submissionApi(store:Store,verify:Verify,origin:string|string[],source?:SourceServices){
  const router=express.Router();
  const uploads=new Set<string>();
  router.use((req,res,next)=>{
    if(!req.headers.origin||!(Array.isArray(origin)?origin:[origin]).includes(req.headers.origin))return res.status(403).json({error:'来源不允许'});
    res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
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
  router.post('/submissions/source',async(req,res)=>{
    if(!source)return res.status(503).json({error:'源码提交尚未开放'});
    try{
      const owner=await verify(req.headers.authorization);if(!owner)return res.status(401).json({error:'请先登录'});
      const {name,author,filename,sha256,size}=req.body??{};
      if(typeof name!=='string'||typeof author!=='string'||!name.trim()||!author.trim()||name.length>60||author.length>60||/[\u0000-\u001f\u007f]/.test(name+author)||typeof sha256!=='string'||!/^[0-9a-f]{64}$/.test(sha256)||typeof size!=='number'||!Number.isInteger(size)||size<1||size>MAX_SUBMISSION_BYTES)return res.status(400).json({error:'源码提交信息无效'});
      let kind:'c'|'cpp';try{kind=sourceLanguage(filename);}catch{return res.status(400).json({error:'请选择 C 或 C++ 源文件'});}
      const reservation=await source.reserveSource(owner,name.trim(),author.trim(),kind,sha256,size);
      return res.status(202).json({id:reservation.id});
    }catch(error){const message=error instanceof Error?error.message:'';return res.status(knownErrors.has(message)?429:503).json({error:knownErrors.has(message)?message:'提交暂时不可用'});}
  });
  router.put('/submissions/source/:id',async(req,res,next)=>{
    if(!source)return res.status(503).json({error:'源码提交尚未开放'});
    try{
      const owner=await verify(req.headers.authorization);if(!owner)return res.status(401).json({error:'请先登录'});
      if(!req.is('application/octet-stream'))return res.status(415).json({error:'源码格式无效'});
      const task=await source.sourceStaging(req.params.id,owner);if(!task)return res.status(404).json({error:'未找到待上传的提交'});
      if(uploads.has(task.id)||uploads.size>=2)return res.status(429).json({error:'上传繁忙，请稍后再试'});
      uploads.add(task.id);res.once('close',()=>uploads.delete(task.id));res.locals.sourceTask=task;res.locals.sourceOwner=owner;next();
    }catch{return res.status(503).json({error:'上传暂时不可用'});}
  },express.raw({type:'application/octet-stream',limit:MAX_SUBMISSION_BYTES}),async(req,res)=>{
    if(!source)return res.status(503).json({error:'源码提交尚未开放'});
    const task=res.locals.sourceTask as {id:string;path:string;sha256:string;size:number;kind:'c'|'cpp'},owner=res.locals.sourceOwner as string;
    try{
      if(!Buffer.isBuffer(req.body)||req.body.length!==task.size||createHash('sha256').update(req.body).digest('hex')!==task.sha256){await source.cancelSource(task.id,owner);return res.status(400).json({error:'源码大小或哈希不匹配，请重新提交'});}
      try{validateSourceSubmission('player.'+task.kind,req.body);}catch{await source.cancelSource(task.id,owner);return res.status(400).json({error:'源码必须是 UTF-8 文本'});}
      await source.upload(task.path,req.body);
      if(!await source.publishSource(task.id,owner))throw Error('提交已失效');
      return res.status(202).json({id:task.id});
    }catch{return res.status(503).json({error:'上传状态暂不确定，请稍后检查'});}
  });
  router.delete('/submissions/source/:id',async(req,res)=>{
    if(!source)return res.status(503).json({error:'源码提交尚未开放'});
    try{
      const owner=await verify(req.headers.authorization);if(!owner)return res.status(401).json({error:'请先登录'});
      const cancelled=await source.cancelSource(req.params.id,owner);
      return cancelled?res.json({ok:true}):res.status(404).json({error:'未找到待上传的提交'});
    }catch{return res.status(503).json({error:'暂时无法取消上传'});}
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
