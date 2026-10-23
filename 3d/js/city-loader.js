// Keep download/JSON parsing off the rendering thread where module workers are supported.
export async function fetchCity(low, progress = () => {}) {
  const names = low ? ['city-lite.json', 'city.json'] : ['city.json'];
  let failure;
  for (const name of names) {
    try {
      progress(name);
      const response = await fetch(new URL('../data/' + name, import.meta.url), {signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + name);
      return await response.json();
    } catch (error) { failure = error; }
  }
  throw failure;
}

export async function loadCity({low = false, onProgress = () => {}, WorkerClass = globalThis.Worker} = {}) {
  if (WorkerClass) {
    let worker, timer;
    try {
      return await new Promise((resolve, reject) => {
        worker = new WorkerClass(new URL('./city-worker.js', import.meta.url), {type: 'module'});
        timer = setTimeout(() => reject(new Error('地圖背景載入逾時')), 65000);
        worker.onmessage = ({data}) => {
          if (data.type === 'progress') onProgress(data.name);
          else if (data.type === 'ready') resolve(data.city);
          else reject(new Error(data.message));
        };
        worker.onerror = () => reject(new Error('地圖背景載入失敗'));
        worker.postMessage({low});
      });
    } catch { /* Browsers that disallow module workers can still load the scene directly. */ }
    finally { clearTimeout(timer); worker?.terminate(); }
  }
  return fetchCity(low, onProgress);
}
