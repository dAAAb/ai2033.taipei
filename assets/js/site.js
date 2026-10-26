// Interactions for the main page: font size, counters, zone tabs, before/after slider, video, credits, share.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // font size (persisted per viewer)
  const sizes = [19, 21, 24, 27];
  let fi = 1;
  try { const v = +localStorage.getItem('fs'); if (v >= 0 && v < sizes.length) fi = v; } catch (e) { }
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
  $$('.sec .h2, .sec-head .lead, .sec-head .sub, .c4, .dl-card, .zone, .story-item, .timeline li, .numgrid li, .photo-card, .gallery figure, .person, .valley-card, .quote, .facts li, .faq-list, .board-card, .compare, .video, .diagram, .bar-split, .fever, .quote-band blockquote').forEach(el => {
    if (!io || reduce) return;
    el.classList.add('reveal');
    if (el.matches('.timeline li, .facts li, .quote-band blockquote')) el.classList.add('from-left');
    if (el.matches('.compare, .video, .diagram')) el.classList.add('zoom');
    // siblings come in one after another
    const sibs = el.parentElement ? [...el.parentElement.children].filter(c => c.tagName === el.tagName) : [];
    el.style.setProperty('--d', Math.min(0.5, Math.max(0, sibs.indexOf(el)) * 0.08) + 's');
    io.observe(el);
  });

  // scroll progress bar, header state, nav highlight for the section in view, and a slow parallax on photo bands
  const bar = document.createElement('div'); bar.className = 'progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  const top = $('.top'), bands = $$('.quote-band');
  const links = $$('.nav a[href^="#"]'), secs = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
    if (top) top.classList.toggle('scrolled', y > 40);
    let cur = null; for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * 0.35) cur = s;
    links.forEach(a => a.classList.toggle('active', !!cur && a.getAttribute('href') === '#' + cur.id));
    if (!reduce) bands.forEach(b => { const r = b.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) b.style.backgroundPositionY = `calc(22% + ${((r.top + r.height / 2 - innerHeight / 2) * -0.12).toFixed(1)}px)`; });
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // 3D city in a full-screen layer: every link into 3d/ opens it here, the back button and Esc close it.
  // The iframe stays loaded after closing, so going back in is instant.
  const p3 = $('#play3d'), frame = $('#play3dFrame');
  const open3d = (href, push = true) => {
    const src = new URL(href, location.href).href;
    if (frame.src !== src) frame.src = src;
    p3.hidden = false; document.body.classList.add('in3d');
    if (push) history.pushState({ p3d: 1 }, '', /[?&]race\b/.test(src) ? '#race' : '#3d');
    setTimeout(() => frame.focus(), 50);
  };
  const close3d = () => {
    if (p3.hidden) return;
    p3.hidden = true; document.body.classList.remove('in3d');
    if (history.state && history.state.p3d) history.back();
    // the game can add history entries of its own (race links), so make sure the address no longer says #3d / #race
    setTimeout(() => { if (p3.hidden && /^#(3d|race)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }, 400);
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="3d/"]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;   // let modified clicks open a real tab
    e.preventDefault(); open3d(a.getAttribute('href'));
  });
  $('#play3dClose').addEventListener('click', close3d);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close3d(); });
  addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'close3d') close3d(); });
  addEventListener('popstate', () => { if (!p3.hidden && !(history.state && history.state.p3d)) { p3.hidden = true; document.body.classList.remove('in3d'); } });
  if (location.hash === '#3d' || location.hash === '#race') open3d(location.hash === '#race' ? '3d/index.html?race' : '3d/index.html', false);

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
    panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';   // replay the fade on every switch
    panel.innerHTML = `<img src="${z.img}" alt="${z.title}示意圖" loading="lazy" onerror="this.style.visibility='hidden'"><div><div class="zbig">${z.big}</div><h3>${z.title}</h3><p>${z.body}</p></div>`;
    $$('.bs').forEach(b => b.style.opacity = b.classList.contains(k) || k === 'urban' ? '1' : '.45');
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
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); sb.textContent = '已複製連結'; } } catch (e) { }
  });
})();
