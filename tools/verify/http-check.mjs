import { readFile } from 'node:fs/promises';
const urls=(await readFile(process.argv[2]||new URL('./urls.txt',import.meta.url),'utf8')).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
let failures=0;
for(const url of urls){
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    console.log(response.status,url);
    await response.body?.cancel();
    if(!response.ok) failures++;
  }catch(error){console.error(url,error.message);failures++;}
}
if(failures) process.exitCode=1;

