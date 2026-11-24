// OCR assets are static files from this site's origin. The image is passed as a
// byte array to a dedicated local worker and is never used as a request body.
const assets = new URL('./assets/vendor/operations-ocr/v7/', import.meta.url);
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 2400;

async function imageBytes(bytes, type) {
  const bitmap = await createImageBitmap(new Blob([bytes], {type}));
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw Error('圖片像素過大');
    if (Math.max(bitmap.width, bitmap.height) <= MAX_SIDE && type !== 'image/webp') return bytes;
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const context = canvas.getContext('2d', {alpha: false});
    if (!context) throw Error('無法建立本機圖片畫布');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Uint8Array(await (await canvas.convertToBlob({type: 'image/png'})).arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export function createLocalOcr() {
  let workerPromise;
  let notify;
  let lastNotice = 0;

  function start() {
    importScripts(new URL('tesseract.min.js', assets).href);
    let rejectInitialization;
    const initializationFailure = new Promise((_, reject) => { rejectInitialization = reject; });
    const tesseractWorker = self.Tesseract.createWorker(['chi_tra', 'eng'], self.Tesseract.OEM.LSTM_ONLY, {
      workerPath: new URL('worker.min.js', assets).href,
      corePath: new URL('tesseract-core-lstm.wasm.js', assets).href,
      langPath: assets.href,
      cacheMethod: 'none',
      workerBlobURL: false,
      errorHandler: () => rejectInitialization(Error('本機 OCR 元件載入或執行失敗')),
      logger: () => {
        const now = Date.now();
        if (now - lastNotice < 1000) return;
        lastNotice = now;
        notify?.();
      }
    });
    return Promise.race([tesseractWorker, initializationFailure]);
  }

  return async (bytes, type, onProgress) => {
    notify = onProgress;
    try {
      const input = await imageBytes(bytes, type);
      workerPromise ||= start();
      const worker = await workerPromise;
      const {data} = await worker.recognize(input);
      return {
        text: data.text.replace(/(?<=[\p{Script=Han}]) +(?=[\p{Script=Han}])/gu, ''),
        confidence: data.confidence
      };
    } finally {
      notify = undefined;
    }
  };
}
