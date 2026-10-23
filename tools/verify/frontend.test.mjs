import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as board from '../../3d/js/board.js';
const originalFetch=globalThis.fetch, values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
after(()=>{globalThis.fetch=originalFetch;delete globalThis.localStorage;});

test('同分採用與伺服器相同的競賽名次',()=>{
  const rows=[{i:'AAA',ms:10000},{i:'BBB',ms:10000},{i:'CCC',ms:12000}];
  assert.equal(board.placeOf(rows,10000),1);assert.equal(board.placeOf(rows,12000),3);
});
test('損壞儲存資料可備援且過濾非法成績',async()=>{
  globalThis.fetch=async()=>{throw new Error('offline');};
  for(const value of ['42','[]','null','"text"','{']){
    values.set('ai2033.race.c2.v2',value);
    assert.deepEqual((await board.boards('c2',5)).total,[]);
  }
  values.set('ai2033.race.c2.v2',JSON.stringify({total:[{i:'AAA',ms:-1},{i:'BBB',ms:200},{i:'<b>',ms:400}],legs:[]}));
  assert.deepEqual((await board.boards('c2',5)).total,[{i:'BBB',ms:200}]);
});
test('相同榜單的同時請求只發送一次',async()=>{
  let calls=0,release;
  globalThis.fetch=async()=>{calls++;await new Promise(resolve=>{release=resolve;});return new Response(JSON.stringify({rev:3,total:[],legs:[]}));};
  const a=board.boards('c2',5),b=board.boards('c2',5);
  assert.equal(calls,1);release();await Promise.all([a,b]);
});
test('RPC 使用逾時訊號並能回到本機榜',async()=>{
  const timeout=AbortSignal.timeout;
  try {
    AbortSignal.timeout=ms=>{assert.equal(ms,8000);return timeout(10);};
    globalThis.fetch=async(url,{signal})=>new Promise((resolve,reject)=>{
      // Keep the test event loop alive; native timeout signals use unref'ed timers.
      const hold=setTimeout(()=>reject(new Error('test timed out')),1000);
      signal.addEventListener('abort',()=>{clearTimeout(hold);reject(signal.reason);},{once:true});
    });
    assert.equal((await board.boards('c2',5)).shared,false);
  } finally {AbortSignal.timeout=timeout;}
});
test('新訪客與非法字級設定保留預設值',async()=>{
  for(const file of ['assets/js/site.js','transcript/transcript.js']){
    const prefix=(await readFile(file,'utf8')).split('\n').slice(0,file.startsWith('assets')?11:7).join('\n')+'\n})();';
    for(const raw of [null,'','1.5','bad']){
      const assigned=[];
      vm.runInNewContext(prefix,{document:{querySelectorAll:()=>[],documentElement:{style:{setProperty:(k,v)=>assigned.push(v)}}},localStorage:{getItem:()=>raw,setItem:()=>{}}});
      assert.deepEqual(assigned,file.startsWith('assets')?[]:['22px']);
    }
  }
});
test('排行榜小數與非法網址參數回到總榜',async()=>{
  const html=await readFile('rank/index.html','utf8');
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;$/gm,'');
  for(const leg of ['1.5','-1','bad','99']){
    const elements=new Map();
    const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',querySelectorAll:()=>[],querySelector:()=>({textContent:''})});return elements.get(id);};
    vm.runInNewContext(script,{board:{...board,boards:async()=>({shared:false,total:[],legs:[[],[],[],[],[]]})},RACE:{id:'c2',stops:Array.from({length:5},()=>({}))},document:{getElementById:el,addEventListener:()=>{}},location:{search:'?leg='+leg,pathname:'/rank/'},URLSearchParams,setInterval:()=>{},navigator:{}});
    assert.equal(el('title').textContent,'總榜・5 單全部送完');
  }
});
