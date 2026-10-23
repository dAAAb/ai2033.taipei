import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
export async function serve(root=process.cwd()) {
  root=path.resolve(root);
  const server=createServer(async(req,res)=>{
    try {
      let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(file!==root && !file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      if((await stat(file)).isDirectory()) file=path.join(file,'index.html');
      const info=await stat(file);
      res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','content-length':info.size});
      createReadStream(file).pipe(res);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
