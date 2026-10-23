import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCity } from '../../3d/js/city-loader.js';
test('手機資料維持原有建築與完整道路、地標',async()=>{
  const full=JSON.parse(await readFile('3d/data/city.json','utf8'));
  const lite=JSON.parse(await readFile('3d/data/city-lite.json','utf8'));
  assert.equal(lite.buildings.h.length,26000);
  for(const [key,values] of Object.entries(full.buildings)) {
    const n=key==='c'?full.buildings.n.slice(0,26000).reduce((a,b)=>a+b,0)*2:26000;
    assert.deepEqual(lite.buildings[key],values.slice(0,n));
  }
  for(const key of Object.keys(full).filter(k=>k!=='buildings')) assert.deepEqual(lite[key],full[key]);
});
test('Worker 不可用且精簡檔缺少時仍可載入完整地圖',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async url=>{requested.push(url.pathname);return url.pathname.endsWith('city-lite.json')?new Response('',{status:404}):new Response('{"ready":true}');};
  try {
    class UnavailableWorker {constructor(){throw new Error('unsupported');}}
    assert.deepEqual(await loadCity({low:true,WorkerClass:UnavailableWorker}),{ready:true});
    assert.ok(requested[0].endsWith('city-lite.json'));assert.ok(requested[1].endsWith('city.json'));
  }finally{globalThis.fetch=original;}
});
