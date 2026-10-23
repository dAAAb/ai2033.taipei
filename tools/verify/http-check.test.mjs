import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { serve } from './serve.mjs';
test('HTTP 檢查遇到 404 必須失敗',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'ai2033-http-'));
  const server=await serve(dir);
  try {
    const file=path.join(dir,'urls.txt');await writeFile(file,server.url+'/missing');
    const child=spawn(process.execPath,['tools/verify/http-check.mjs',file],{stdio:'ignore'});
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
    assert.equal(code,1);
  }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});
