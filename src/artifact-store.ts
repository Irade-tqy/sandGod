import {constants} from 'node:fs';
import {lstat,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX=16*1024*1024;
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');

export class ArtifactStore {
  constructor(private readonly root:string){if(!path.isAbsolute(root))throw Error('本地评测目录必须为绝对路径');}
  private filename(id:string){if(!UUID.test(id))throw Error('选手文件编号无效');return path.join(this.root,id+'.wasm');}
  private async ensureDirectory(){
    await mkdir(this.root,{recursive:true,mode:0o700});
    const info=await lstat(this.root);
    if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0||(typeof process.getuid==='function'&&info.uid!==process.getuid()))throw Error('本地评测目录不安全');
  }
  async save(id:string,wasm:Uint8Array):Promise<string>{
    if(!(wasm instanceof Uint8Array)||wasm.length<8||wasm.length>MAX||!Buffer.from(wasm.slice(0,4)).equals(Buffer.from([0,97,115,109])))throw Error('编译结果无效');
    await this.ensureDirectory();const file=this.filename(id),hash=digest(wasm);
    try{
      const handle=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await handle.writeFile(wasm);await handle.sync();}finally{await handle.close();}
      const directory=await open(this.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      try{await directory.sync();}finally{await directory.close();}
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      await this.read(id,hash);
    }
    return hash;
  }
  async read(id:string,expected:string):Promise<Buffer>{
    if(!/^[0-9a-f]{64}$/.test(expected))throw Error('选手文件校验信息无效');
    await this.ensureDirectory();const handle=await open(this.filename(id),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const info=await handle.stat();if(!info.isFile()||info.size<8||info.size>MAX)throw Error('选手文件无效');
      const data=await handle.readFile();if(digest(data)!==expected)throw Error('选手文件校验失败');
      return data;
    }finally{await handle.close();}
  }
}
