import { fetchCity } from './city-loader.js';
self.onmessage = async ({data}) => {
  try {
    const city = await fetchCity(data.low, name => self.postMessage({type: 'progress', name}));
    self.postMessage({type: 'ready', city});
  } catch (error) { self.postMessage({type: 'error', message: error.message}); }
};
