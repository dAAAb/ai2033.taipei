import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../api/card.js';

test('修補相依套件後各種分享卡仍能輸出 1200×630 PNG',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('race_boards')
    ? {total:[{i:'TST',ms:83450}]}
    : {id:1,course:'c2',initials:'TST',ms:83450,leg:0,rank:1,total:1}));
  try {
    for(const query of ['', '?n=TST&ms=83450&k=0','?n=TST&ms=850&k=4','?board=1','?id=1']){
      const response=await handle(new Request('https://example.test/card'+query));
      assert.equal(response.headers.get('content-type'),'image/png');
      const png=Buffer.from(await response.arrayBuffer());
      assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
      assert.ok(png.length>20000);
    }
  }finally{globalThis.fetch=original;}
});
