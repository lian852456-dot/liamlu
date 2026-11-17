'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');

// Serve only the public assets under test, using the same HTTP transport as hosting.
async function serve(root,names){
 const allowed=new Set(names);
 const server=http.createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(name)){res.writeHead(404);res.end();return;}
  try{
   const data=await fs.readFile(path.join(root,name));
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(name)];
   res.writeHead(200,{'Content-Type':mime+';charset=utf-8'});res.end(data);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:'http://127.0.0.1:'+server.address().port+'/',close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={serve};
