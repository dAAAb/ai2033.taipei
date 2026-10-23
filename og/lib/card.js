// Share card layouts (1200×630) as satori element trees: one finished run, one order, the boards, or the site.
import { readFileSync } from 'node:fs';
import { ORDERS, fmtTime, fmtAny } from './common.js';

const file = (p) => { const b = readFileSync(new URL(p, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
// Noto Sans TC cut down to the characters these cards use (og/tools/subset.py rebuilds them)
export const FONTS = [
  { name: 'TC', data: file('./fonts/NotoSansTC-900.subset.ttf'), weight: 900, style: 'normal' },
  { name: 'TC', data: file('./fonts/NotoSansTC-700.subset.ttf'), weight: 700, style: 'normal' },
];
const BG = `data:image/jpeg;base64,${Buffer.from(file('../assets/bg.jpg')).toString('base64')}`;
const C = { navy: '#0b1730', gold: '#ffc83d', gold2: '#ffe08a', cyan: '#58d8ff', white: '#ffffff', muted: '#b9c4dc' };

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children } });
const tag = (text, bg, fg) => h('div', { background: bg, color: fg, fontSize: 28, fontWeight: 900, padding: '6px 18px', borderRadius: 999, letterSpacing: 2 }, text);
const badge = (initials) => h('div', { border: `5px solid ${C.gold}`, background: '#05080e', color: C.gold, fontSize: 84, fontWeight: 900, letterSpacing: 14, padding: '0 14px 0 26px', borderRadius: 14, lineHeight: 1.15 }, initials);

function frame(top, middle, bottom) {
  return h('div', { width: 1200, height: 630, position: 'relative', background: C.navy, fontFamily: 'TC', color: C.white },
    { type: 'img', props: { src: BG, width: 1200, height: 630, style: { position: 'absolute', left: 0, top: 0, width: 1200, height: 630, objectFit: 'cover' } } },
    h('div', { position: 'absolute', left: 0, top: 0, width: 1200, height: 630, backgroundImage: 'linear-gradient(90deg, rgba(8,14,30,0.97) 0%, rgba(8,14,30,0.9) 48%, rgba(8,14,30,0.35) 100%)' }),
    h('div', { position: 'absolute', left: 0, bottom: 0, width: 1200, height: 14, backgroundImage: `linear-gradient(90deg, ${C.gold}, ${C.cyan})` }),
    h('div', { position: 'absolute', left: 0, top: 0, width: 1200, height: 616, flexDirection: 'column', justifyContent: 'space-between', padding: '50px 64px 40px' },
      top, middle, bottom));
}
const header = (right) => h('div', { alignItems: 'center', justifyContent: 'space-between' },
  h('div', { fontSize: 36, fontWeight: 900, color: C.gold, letterSpacing: 4 }, '臺北 2033・外送王'), right);
const footer = (left) => h('div', { alignItems: 'flex-end', justifyContent: 'space-between' },
  h('div', { fontSize: 34, fontWeight: 700 }, left), h('div', { fontSize: 32, fontWeight: 900, color: C.gold }, 'ai2033.taipei'));

export function cardTree(x) {
  if (x.kind === 'run') {
    const leg = x.leg, o = ORDERS[leg - 1];
    const place = x.rank ? h('div', { alignItems: 'baseline', background: C.gold, color: C.navy, borderRadius: 16, padding: '8px 26px' },
      h('div', { fontSize: 42, fontWeight: 900 }, `全台${leg ? '任務榜' : '總榜'} 第 ${x.rank} 名`),
      h('div', { fontSize: 28, fontWeight: 700, marginLeft: 14 }, `共 ${x.total} 筆`))
      : h('div', { border: `2px solid ${C.muted}`, color: C.muted, borderRadius: 16, padding: '6px 22px', fontSize: 32, fontWeight: 700 }, '自己的成績・未登上全台排行榜');
    const time = leg
      ? h('div', { alignItems: 'baseline' }, h('div', { fontSize: 190, fontWeight: 900, lineHeight: 1, textShadow: `6px 6px 0 ${C.gold}` }, (x.ms / 1000).toFixed(2)), h('div', { fontSize: 64, fontWeight: 900, marginLeft: 16 }, '秒'))
      : h('div', { fontSize: 190, fontWeight: 900, lineHeight: 1, textShadow: `6px 6px 0 ${C.gold}` }, fmtTime(x.ms));
    return frame(
      header(tag(leg ? `第 ${leg} 單任務` : '5 單全送完', C.cyan, C.navy)),
      h('div', { flexDirection: 'column' },
        h('div', { alignItems: 'center' }, badge(x.initials),
          h('div', { fontSize: 46, fontWeight: 700, marginLeft: 26, color: C.white }, leg ? `${o.item} → ${o.to}` : '送完 5 單只花')),
        h('div', { marginTop: 18 }, time),
        h('div', { marginTop: 24 }, place)),
      footer(`你能比 ${x.initials} 快嗎？點開直接挑戰 →`));
  }
  if (x.kind === 'board') {
    const medal = ['#ffc83d', '#d7dde8', '#e0a370'];
    const rows = x.rows.length
      ? x.rows.map((r, j) => h('div', { alignItems: 'center', marginTop: j ? 14 : 0 },
          h('div', { width: 72, height: 72, borderRadius: 36, background: medal[j], color: C.navy, fontSize: 44, fontWeight: 900, alignItems: 'center', justifyContent: 'center' }, String(x.rows.filter(row => row.ms < r.ms).length + 1)),
          h('div', { fontSize: 72, fontWeight: 900, letterSpacing: 12, marginLeft: 30, width: 230, color: C.gold }, r.i),
          h('div', { fontSize: 72, fontWeight: 900 }, fmtAny(r.ms))))
      : [h('div', { fontSize: 60, fontWeight: 900, color: C.gold }, '還沒有人上榜・搶第一！')];
    return frame(
      header(tag('總榜 TOP 3', C.cyan, C.navy)),
      h('div', { flexDirection: 'column' }, h('div', { fontSize: 76, fontWeight: 900, marginBottom: 26 }, '全台排行榜'), ...rows),
      footer('開小黃送 5 單，你上得了榜嗎？'));
  }
  if (x.kind === 'rank') {   // the static preview of ai2033.taipei/rank/
    return frame(
      header(tag('即時更新', C.cyan, C.navy)),
      h('div', { flexDirection: 'column' },
        h('div', { fontSize: 120, fontWeight: 900, lineHeight: 1.1, textShadow: `6px 6px 0 ${C.gold}` }, '全台排行榜'),
        h('div', { fontSize: 48, fontWeight: 700, marginTop: 24 }, '總榜＋5 張任務榜'),
        h('div', { fontSize: 48, fontWeight: 700, color: C.gold2 }, '開小黃送餐，誰最快？')),
      footer('你上榜了嗎？點開看名次 →'));
  }
  return frame(
    header(tag('限時外送挑戰', C.cyan, C.navy)),
    h('div', { flexDirection: 'column' },
      h('div', { fontSize: 120, fontWeight: 900, lineHeight: 1.1, textShadow: `6px 6px 0 ${C.gold}` }, '2033 外送王'),
      h('div', { fontSize: 48, fontWeight: 700, marginTop: 24 }, '開小黃在臺北AI園區送 5 單'),
      h('div', { fontSize: 48, fontWeight: 700, color: C.gold2 }, '每一單都有全台排行榜')),
    footer('點開直接開賽 →'));
}
