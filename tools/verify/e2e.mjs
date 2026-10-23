import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';
const server = process.argv[2] ? null : await serve();
const base = process.argv[2] || server.url;
const output = process.env.TEST_OUTPUT_DIR || '.test-results';
await mkdir(output, {recursive:true});
let browser;
try {
  browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const context = await browser.newContext({viewport:{width:1280,height:720}});
  if (server) await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.pathname.endsWith('/rpc/race_boards')) return route.fulfill({json:{rev:3,total:[{i:'TST',ms:10000}],legs:[[],[],[],[],[]]}});
    // Local regression checks must not depend on external fonts, YouTube or production data.
    return route.fulfill({status:200,contentType:url.hostname.includes('fonts')?'text/css':'text/html',body:''});
  });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('response', r => {if(r.url().startsWith(base+'/') && r.status()>=400) errors.push(r.status()+' '+r.url());});
  p.on('requestfailed', r => {if(r.url().startsWith(base+'/')) errors.push(r.url()+': '+r.failure()?.errorText);});
  await p.goto(base+'/3d/?low=1');
  await p.waitForFunction(()=>window.__S?.ready,{},{timeout:120000});
  await p.locator('#btnStart').click();
  const before=await p.evaluate(()=>({x:__S.car.x,z:__S.car.z,blocked:__api.blocked(__S.car.x,__S.car.z)}));
  assert.equal(before.blocked,false,'車輛出生點不可卡在建築內');
  await p.keyboard.down('KeyW');
  try {await p.waitForFunction(({x,z})=>Math.hypot(__S.car.x-x,__S.car.z-z)>3,before,{timeout:10000});}
  finally {await p.keyboard.up('KeyW');}
  await p.screenshot({path:output+'/3d.png'});
  for (const path of ['/','/transcript/','/slides/','/rank/']) {
    const response=await p.goto(base+path);
    assert.equal(response.status(),200,path);
    await p.locator('h1').first().waitFor();
    assert.ok((await p.title()).trim(),path+' 必須有標題');
    if(path==='/transcript/') {await p.locator('#q').fill('松山'); await p.waitForFunction(()=>document.querySelectorAll('mark.hit').length>0);}
    if(path==='/slides/') {await p.locator('#next').click(); await p.waitForURL('**/#2');}
    if(path==='/rank/' && server) {await p.getByText('TST',{exact:true}).waitFor();}
    await p.screenshot({path:output+'/'+(path.split('/')[1]||'home')+'.png'});
  }
  assert.deepEqual(errors,[],'瀏覽器錯誤或本機資源失敗');
  console.log('通過：3D 載入與實際鍵盤駕駛、五個頁面、逐字稿搜尋、簡報翻頁、排行榜');
} finally {
  if(browser) await browser.close();
  if(server) await server.close();
}

