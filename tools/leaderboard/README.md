# 2033 外送王：全台排行榜（Supabase）

外送賽有 6 張榜：**總榜**（5 單全部送完的總時間）和 5 張**任務榜**（每一單各自的時間）。

- 每送完一單，如果這單的時間進了該單任務榜前 10 名，計時暫停並跳出提示：可以**現在登錄並結束**，或**繼續送**、最後連同總榜一起登錄。
- 沒進前 10 名就不打斷，任務面板上會顯示該單任務榜前幾名，繼續開。
- 中途按「退出比賽」時，如果手上有已經破榜的單，會先讓你登錄。

網站已經接上專案 `ogvqrfdgflxhfdqwtrxq`（網址和 publishable key 在 [`3d/js/board.js`](../../3d/js/board.js)）。連不上時，成績會先存在玩家自己的瀏覽器裡。

## 設定（第一次，或 SQL 有更新時）

1. Supabase 專案左側 **SQL Editor** → New query。
2. 貼上 [`supabase.sql`](supabase.sql) 全部內容 → **Run**。重複執行沒關係；舊版會自動升級，已有的成績會保留。SQL 有更新時（例如調整極速）要再執行一次：網站只在資料庫版本（`race_boards()` 回傳的 `rev`）對得上時才用公榜，對不上就先存在玩家裝置。
3. 到 GitHub 的 **Actions → leaderboard check → Run workflow**，從外部確認：函式存在、回應格式正確、亂送的成績會被擋下（這個檢查不會寫入任何資料）。

## 看排行榜、分享成績

- 不用進遊戲也能看：<https://ai2033.taipei/rank/>（總榜＋5 張任務榜，每 30 秒更新；`?leg=2` 直接開第 2 單）。
- 分享卡：登錄後的每筆成績都有編號（`race_entry(id)`），[`og/`](../../og/) 的分享服務會用它產生附名字、時間、名次的預覽圖。

## 安全與防作弊

- publishable key 是公開金鑰，本來就會出現在網頁裡；資料表開了 RLS 而且沒有任何 policy，瀏覽器**不能直接讀寫**，只能呼叫兩個函式：
  - `race_boards(course, limit)`：總榜和 5 張任務榜的前 N 名（只回傳名字和時間）
  - `submit_score(course, initials, legs, splits, trace)`：登錄這一趟（完整或中途）要上的榜
  - `race_entry(id)`：單筆成績與它目前的名次（給分享卡用）
- `submit_score` 會重播這一趟每 0.5 秒的位置：起點要對、時間只能往前、任兩點之間不能比小黃三段加速的極速（58 m/s）還快、每一單要依序在各自的分段時間送達；總榜只收 5 單全送完的；不通過就回 `implausible`，並在 `details` 說明哪一項沒過（例如 `speed 158 at 3500` 表示第 3.5 秒時速 158 m/s），遊戲會把原因翻成白話告訴玩家。
- 同一個連線 15 秒內只能登錄一次（`rate_limited`）；名字只收 A–Z 三個字母，並擋掉一小份不雅字詞（`blocked_initials`，清單在 SQL 與 `board.js` 裡各一份）。
- 同時送出的請求會依「請求、連線、路線」順序取得交易鎖，避免並行繞過限流或重播檢查。成功請求的 SHA-256 摘要與結果存在不公開的 `race_submissions`；網路斷線後原樣重送會取得原始結果，不會再次寫入。本機排行榜也使用每趟固定識別碼避免重試產生重複紀錄。
- 此限流只計算成功登錄；大量失敗請求仍須在可信任的 API 閘道加上速率限制，並由閘道覆寫來源 IP 標頭。
- 前端遊戲終究在玩家手上，會寫程式的人仍有辦法偽造一條「看起來合理」的路線。看到可疑的紀錄，在 SQL Editor 刪掉即可：
  ```sql
  -- leg 0 = 總榜，1–5 = 第幾單的任務榜
  select id, leg, initials, ms, created_at from public.race_scores where course = 'c1' order by leg, ms limit 60;
  delete from public.race_scores where id = 123;
  ```

## 改路線

路線、速度與版本的唯一來源是 `config/race.json`。修改後在根目錄執行 `node tools/build/race-config.mjs`，同步產生瀏覽器、分享卡與 SQL 設定；`node tools/build/race-config.mjs --check` 會檢查產物是否過期。產生器只更新 SQL 的路線與版本，不會覆寫登錄驗證邏輯。

改變外送點或速度時新增 course（例如 `c3`），保留舊 course 的設定以繼續讀取歷史成績，再更新 `activeCourse`。套用更新後的 SQL，再部署前端與分享卡。分享卡的產物放在 `og/lib/`，所以 Vercel 仍可單獨以 `og/` 為根目錄部署。

## 本機驗證

在專案根目錄執行 `npm ci`、`npm test`。PGlite 測試使用記憶體資料庫。並行測試需要額外設定 `TEST_DATABASE_URL` 指向可清空的本機 PostgreSQL 測試資料庫；測試會清空成績及請求紀錄，禁止指向正式資料庫。未設定時會明確顯示跳過並行測試。
