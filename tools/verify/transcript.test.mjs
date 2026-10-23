import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
test('已有音訊時跳過鏡像下載並繼續轉檔流程',async()=>{
  const source=await readFile(new URL('../fetch/youtube.sh',import.meta.url),'utf8');
  const mirrors=source.slice(source.indexOf('# 1) Invidious mirrors'),source.indexOf('# 2) Piped mirrors'));
  const script="set -u\nhave_audio() { return 0; }\ncurl() { echo 'unexpected network' >&2; exit 99; }\n"+mirrors+"\nprintf 'conversion reached\\n'\n";
  const bash=process.platform==='win32'?path.join(process.env.ProgramFiles,'Git/bin/bash.exe'):'bash';
  const result=spawnSync(bash,['-s'],{input:script.replaceAll('\r\n','\n'),encoding:'utf8',env:{...process.env,INV:undefined}});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/conversion reached/);assert.equal(result.stderr,'');
});
