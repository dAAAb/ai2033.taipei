#!/usr/bin/env bash
# Fetch audio (and captions if any) for the 2026-10-08 press conference video.
# YouTube bot-checks datacenter IPs, so try public Invidious/Piped mirrors, then yt-dlp (+PO token provider).
set -u
VID="${1:-ircGbXWHRbQ}"
OUT=research/youtube
mkdir -p "$OUT" /tmp/yt
URL="https://www.youtube.com/watch?v=$VID"
log() { echo "$*" | tee -a "$OUT/fetch_log.txt"; }
: > "$OUT/fetch_log.txt"

have_audio() { ls /tmp/yt/audio.* >/dev/null 2>&1 && [ "$(stat -c %s $(ls /tmp/yt/audio.* | head -1))" -gt 500000 ]; }

# 0a) an audio/video file uploaded to research/youtube/input/ (drag & drop on GitHub)
IN=$(ls research/youtube/input/* 2>/dev/null | grep -Ei '\.(mp3|m4a|wav|mp4|webm|mov|aac|ogg|opus)$' | head -1)
if [ -n "$IN" ]; then log "== using uploaded file $IN"; cp "$IN" "/tmp/yt/audio.${IN##*.}"; fi
# 0b) a direct media URL given to workflow_dispatch
if ! have_audio && [ -n "${MEDIA_URL:-}" ]; then log "== downloading MEDIA_URL"; yt-dlp -f "bestaudio/best" -o "/tmp/yt/audio.%(ext)s" "$MEDIA_URL" || curl -fL -o /tmp/yt/audio.media "$MEDIA_URL"; fi
# 0c) YouTube with cookies stored as the repository secret YT_COOKIES (Netscape cookies.txt)
if ! have_audio && [ -n "${YT_COOKIES:-}" ]; then
  log "== yt-dlp with YT_COOKIES secret"; printf '%s' "$YT_COOKIES" > /tmp/yt/cookies.txt
  yt-dlp --cookies /tmp/yt/cookies.txt -f "bestaudio/best" -o "/tmp/yt/audio.%(ext)s" "$URL" 2>&1 | tail -3 | tee -a "$OUT/fetch_log.txt"
fi

# 1) Invidious mirrors
INV=''
have_audio || INV=$(curl -s -m 30 "https://api.invidious.io/instances.json?sort_by=health" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(' '.join('https://'+n for n,i in d if i.get('type')=='https' and i.get('api')))
except Exception: pass")
INV="$INV https://inv.nadeko.net https://yewtu.be https://invidious.nerdvpn.de https://iv.ggtyler.dev https://invidious.f5.si https://inv.tux.pizza https://invidious.privacyredirect.com https://iv.melmac.space https://invidious.jing.rocks"
for inst in $INV; do
  have_audio && break
  log "== invidious $inst"
  curl -s -m 40 "$inst/api/v1/videos/$VID?local=true" -o /tmp/yt/inv.json || continue
  python3 - "$inst" <<'PY' > /tmp/yt/inv_url.txt 2>>"$OUT/fetch_log.txt"
import json,sys
inst=sys.argv[1]
d=json.load(open('/tmp/yt/inv.json'))
if 'error' in d: print('', end=''); sys.stderr.write('inv error: '+str(d.get('error'))[:200]+'\n'); sys.exit()
json.dump({k:d.get(k) for k in ('title','author','published','lengthSeconds','description','captions')}, open('research/youtube/meta_invidious.json','w'), ensure_ascii=False, indent=1)
fm=[f for f in d.get('adaptiveFormats',[]) if f.get('type','').startswith('audio')]
fm.sort(key=lambda f: (('mp4' in f.get('type','')), int(f.get('bitrate',0) or 0)), reverse=True)
if fm:
  u=fm[0]['url']; print(u if u.startswith('http') else inst+u)
PY
  U=$(cat /tmp/yt/inv_url.txt)
  [ -n "$U" ] || continue
  log "   audio url found, downloading"
  curl -sL -m 1800 --retry 3 "$U" -o /tmp/yt/audio.m4a || rm -f /tmp/yt/audio.m4a
  have_audio || { log "   download too small/failed"; rm -f /tmp/yt/audio.*; }
done

# 2) Piped mirrors
if ! have_audio && [ -z "${SKIP_MIRRORS:-}" ]; then
  PIPED=$(curl -s -m 30 "https://piped-instances.kavin.rocks/" | python3 -c "
import json,sys
try: print(' '.join(i['api_url'] for i in json.load(sys.stdin)))
except Exception: pass")
  PIPED="$PIPED https://pipedapi.kavin.rocks https://api.piped.private.coffee https://pipedapi.adminforge.de https://pipedapi.r4fo.com"
  for api in $PIPED; do
    have_audio && break
    log "== piped $api"
    curl -s -m 40 "$api/streams/$VID" -o /tmp/yt/piped.json || continue
    U=$(python3 -c "
import json
try:
  d=json.load(open('/tmp/yt/piped.json'))
  a=sorted(d.get('audioStreams',[]), key=lambda s:(s.get('mimeType','').find('mp4')>=0, s.get('bitrate',0)), reverse=True)
  print(a[0]['url'] if a else '')
except Exception as e: print('')")
    [ -n "$U" ] || continue
    log "   audio url found"
    curl -sL -m 1800 --retry 3 "$U" -o /tmp/yt/audio.m4a || rm -f /tmp/yt/audio.m4a
    have_audio || { log "   download too small/failed"; rm -f /tmp/yt/audio.*; }
  done
fi

# 3) yt-dlp with PO-token provider (bgutil)
if ! have_audio; then
  log "== yt-dlp + bgutil POT provider"
  pip install -q -U bgutil-ytdlp-pot-provider >/dev/null 2>&1 || true
  (git clone -q --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /tmp/bgutil && cd /tmp/bgutil/server && (npm ci --silent || npm install --silent) && npx tsc && (node build/main.js > /tmp/bgutil.log 2>&1 &) ) || log "   bgutil setup failed"
  sleep 8
  for c in "default" "mweb" "web" "tv" "web_safari"; do
    have_audio && break
    yt-dlp -f "bestaudio/best" --extractor-args "youtube:player_client=$c" -o "/tmp/yt/audio.%(ext)s" "$URL" 2>&1 | tail -3 | tee -a "$OUT/fetch_log.txt"
  done
fi

A=$(ls /tmp/yt/audio.* 2>/dev/null | head -1)
if [ -z "$A" ]; then log "NO AUDIO"; echo "audio download failed $(date -u)" > "$OUT/STATUS.txt"; exit 0; fi
ffmpeg -nostdin -loglevel error -y -i "$A" -ac 1 -ar 16000 /tmp/yt/audio16k.wav
ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/yt/audio16k.wav > "$OUT/duration.txt"
echo "audio ok $(cat $OUT/duration.txt)s $(date -u)" > "$OUT/STATUS.txt"
