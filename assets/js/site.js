// Interactions for the main page: font size, counters, zone tabs, before/after slider, video, credits, share.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // font size (persisted per viewer)
  const sizes = [19, 21, 24, 27];
  let fi = 1;
  try { const raw = localStorage.getItem('fs'), v = Number(raw); if (raw !== null && raw.trim() !== '' && Number.isInteger(v) && v >= 0 && v < sizes.length) fi = v; } catch (e) { }
  const applyFs = () => { document.documentElement.style.setProperty('--fs', sizes[fi] + 'px'); try { localStorage.setItem('fs', fi); } catch (e) { } };
  if (fi !== 1) applyFs();
  $$('.fontsize button').forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.fs; fi = d === 0 ? 1 : Math.max(0, Math.min(sizes.length - 1, fi + d)); applyFs();
  }));

  // counters
  const fmt = (v, dec) => dec ? v.toFixed(dec) : String(Math.round(v));
  const count = (el) => {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || '';
    if (to >= 1900 && to <= 2100) { el.textContent = to + suf; return; }
    const t0 = performance.now(), dur = 1300;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e, dec) + suf; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target; io.unobserve(el);
    if (el.dataset.count && !reduce) count(el);
    el.classList.add('in');
  }), { threshold: 0.3 }) : null;
  $$('[data-count]').forEach(el => io && io.observe(el));
  $$('.sec .h2, .c4, .dl-card, .zone, .story-item, .timeline li, .numgrid li').forEach(el => { if (io && !reduce) { el.classList.add('reveal'); io.observe(el); } });

  // zone tabs
  const Z = {
    ai: { img: 'assets/renders/ai-2033.jpg', big: '100 公頃', title: 'AI 產業聚落', body: '以<strong>松南營區、松機南側</strong>與中央攜手整合。從最底層的晶片到終端軟體應用，產業鏈上有 <strong>200 家</strong>臺灣本土企業（含台積電等 50 家上市櫃公司、150 家未上市企業與新創）。產業局推估 <strong>12 兆元產值</strong>、<strong>6.5 萬</strong>就業人口。' },
    live: { img: 'assets/renders/live-2033.jpg', big: '90 公頃', title: '國際永續生活聚落', body: '住宅及支援性公共設施，預計可容納 <strong>3.5 萬</strong>居住人口；加上 6.5 萬就業人口，形成<strong>超過 10 萬人</strong>的生活聚落，帶動跨國專業服務、金融科技與國際創投、高階會展、商務旅宿。' },
    park: { img: 'assets/renders/park-2033.jpg', big: '110 公頃', title: '臺北中央公園', body: '在<strong>松機北半側</strong>闢建，面積與英國海德公園相近，約為東京代代木公園 <strong>2 倍</strong>、大安森林公園 <strong>4 倍</strong>，打造臺北都市生態的<strong>「綠色脊柱」</strong>，並結合基隆河大直段河岸再造。' },
    urban: { img: 'assets/renders/renewal-2033.jpg', big: '570 公頃', title: '航高解禁・大都更時代', body: '跑道前後端的航高限制，讓周邊許多 <strong>4、5 層樓老舊建築</strong>長期無法改建。松機遷移後，約 <strong>570 公頃</strong>都市更新劃定地區有機會都更改建；都發局推估都更加上園區開發可增加 <strong>15 萬戶</strong>居住單元。' },
  };
  const panel = $('#zonePanel');
  const showZone = (k) => {
    const z = Z[k];
    panel.innerHTML = `<img src="${z.img}" alt="${z.title}示意圖" loading="lazy" onerror="this.style.visibility='hidden'"><div><div class="zbig">${z.big}</div><h3>${z.title}</h3><p>${z.body}</p></div>`;
    $$('.zone').forEach(b => { const on = b.dataset.zone === k; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  };
  $$('.zone').forEach(b => b.addEventListener('click', () => showZone(b.dataset.zone)));
  if (panel) showZone('ai');

  // before / after slider
  const box = $('#compareBox'), range = $('#compareRange');
  if (box && range) {
    const set = (v) => { box.querySelector('.before-wrap').style.clipPath = `inset(0 ${100 - v}% 0 0)`; box.querySelector('.handle').style.left = v + '%'; };
    range.addEventListener('input', () => set(+range.value)); set(50);
  }

  // lazy YouTube embed
  const cover = $('#ytCover'), yt = $('#yt');
  if (cover && yt) cover.addEventListener('click', () => { yt.src = yt.dataset.src + '&autoplay=1'; cover.remove(); });

  // photo credits are static HTML in index.html (tools/build/credits_html.py)

  // share
  const sb = $('#btnShare');
  if (sb) sb.addEventListener('click', async () => {
    const data = { title: document.title, text: 'AI黃金世紀，從臺北開始！松機變身 300 公頃臺北AI園區', url: location.href.split('#')[0] };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); sb.textContent = '✅ 已複製連結'; } } catch (e) { }
  });
})();
