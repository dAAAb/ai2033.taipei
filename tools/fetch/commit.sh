#!/usr/bin/env bash
# Commit the given paths back to the branch that triggered the workflow (retrying on races).
set -u
msg="$1"; shift
# 舊版驗證流程會回寫公開網站截圖；fork 的修正分支不應因此被背景提交改動。
# 正式來源資料抓取仍可提交；新的 CI 以 artifact 保存驗證結果。
if [ "${GITHUB_REPOSITORY:-}" != "dAAAb/ai2033.taipei" ] && [ "$#" -eq 1 ] && [ "$1" = "research/verify" ]; then
  echo "fork 驗證結果保留於工作流程，不回寫分支"
  exit 0
fi
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
for p in "$@"; do [ -e "$p" ] && git add -A "$p"; done
if git diff --cached --quiet; then echo "nothing to commit"; exit 0; fi
git commit -m "$msg"
for i in 1 2 3 4 5 6; do
  if git pull --rebase -X theirs origin "$GITHUB_REF_NAME" && git push origin "HEAD:$GITHUB_REF_NAME"; then exit 0; fi
  sleep $((i * 7))
done
exit 1
