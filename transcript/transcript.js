// Font size + in-page search with highlighted hits.
(() => {
  const sizes = [18, 20, 22, 25, 28]; let i = 2;
  try { const raw = localStorage.getItem('tfs'), v = Number(raw); if (raw !== null && raw.trim() !== '' && Number.isInteger(v) && v >= 0 && v < sizes.length) i = v; } catch (e) { }
  const apply = () => { document.documentElement.style.setProperty('--fs', sizes[i] + 'px'); try { localStorage.setItem('tfs', i); } catch (e) { } };
  apply();
  document.querySelectorAll('.fs button').forEach(b => b.onclick = () => { i = Math.max(0, Math.min(sizes.length - 1, i + +b.dataset.fs)); apply(); });

  const scope = [...document.querySelectorAll('.text p, .segs p, .qa p')];
  const orig = new Map(scope.map(p => [p, p.innerHTML]));
  const q = document.getElementById('q'), hits = document.getElementById('hits');
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 180); });
  function run() {
    const s = q.value.trim();
    let n = 0, first = null;
    for (const p of scope) {
      p.innerHTML = orig.get(p);
      if (!s) continue;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const idx = node.nodeValue.indexOf(s); if (idx < 0) continue;
        const parts = node.nodeValue.split(s); const frag = document.createDocumentFragment();
        parts.forEach((part, k) => { frag.appendChild(document.createTextNode(part)); if (k < parts.length - 1) { const m = document.createElement('mark'); m.className = 'hit'; m.textContent = s; frag.appendChild(m); n++; first = first || m; } });
        node.parentNode.replaceChild(frag, node);
      }
    }
    hits.textContent = s ? (n ? `找到 ${n} 處` : '沒有找到') : '';
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
})();
