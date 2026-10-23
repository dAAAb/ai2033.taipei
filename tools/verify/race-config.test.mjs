import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resetControls } from '../../3d/js/controls.js';
test('前端、分享卡與 SQL 設定皆與來源一致',()=>{
  const result=spawnSync(process.execPath,['tools/build/race-config.mjs','--check'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
test('失去焦點時清除鍵盤、觸控與攝影機拖曳狀態',()=>{
  const state={keys:{KeyW:true},joy:{x:1,y:1},up:1,down:1,boost:1,cam:{drag:true}};
  resetControls(state);
  assert.deepEqual(state,{keys:{},joy:{x:0,y:0},up:0,down:0,boost:0,cam:{drag:false}});
});
