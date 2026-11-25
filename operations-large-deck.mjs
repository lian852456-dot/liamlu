// The caller passes the selected File to this worker by structured clone.
// Read only the referenced slide parts. Hash the full original in small chunks
// so the audit reference also covers unused media and embedded documents.
import {BlobReader, ZipReader, Uint8ArrayWriter, sha256} from './assets/vendor/operations-import/reader-2.25.0-2.4.0.mjs';
import {MAX_MARKETING_PPTX_BYTES} from './operations-brief-core.mjs?v=20261125-large-marketing';
import {inspectMarketing, MAX_SLIDE_XML, MAX_IMAGE_BYTES} from './operations-marketing-core.mjs?v=20261125-large-marketing';

async function hashFile(file, onProgress) {
  const chunkSize = 4 * 1024 * 1024;
  const hash = sha256.create();
  try {
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, file.size);
      const chunk = await file.slice(offset, end).arrayBuffer();
      hash.update(new Uint8Array(chunk));
      onProgress?.('正在本機核對原檔指紋 ' + Math.round(100 * end / file.size) + '%');
    }
    return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, '0')).join('');
  } finally {
    hash.destroy();
  }
}

function slidePart(entry) {
  return {
    uncompressedSize: entry.uncompressedSize,
    async async(format) {
      const text = format === 'string';
      if (entry.uncompressedSize > (text ? MAX_SLIDE_XML : MAX_IMAGE_BYTES)) {
        throw Error('簡報內的頁面或圖片過大，請在本機另存該頁後重新讀取。');
      }
      const bytes = await entry.getData(new Uint8ArrayWriter(), {checkSignature: true});
      return text ? new TextDecoder().decode(bytes) : bytes;
    }
  };
}

export async function inspectLocalDeck(file, options = {}) {
  const reader = new ZipReader(new BlobReader(file), {useWebWorkers: false});
  try {
    options.onProgress?.('正在本機讀取簡報目錄…');
    const parts = new Map();
    let count = 0;
    let expanded = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > 10000) throw Error('簡報內部項目超過 10,000，請依章節分檔。');
      if (entry.directory) continue;
      expanded += entry.uncompressedSize;
      if (!Number.isSafeInteger(expanded) || expanded > MAX_MARKETING_PPTX_BYTES) {
        throw Error('簡報解壓後超過 512 MiB。請用 PowerPoint 壓縮圖片或依章節另存。');
      }
      if (entry.encrypted) throw Error('簡報含加密內容，請在本機 PowerPoint 另存無開啟密碼的 PPTX。');
      if (/(?:^|\/)vbaProject\.bin$/i.test(entry.filename) || /(?:^|\/)activeX\//i.test(entry.filename)) {
        throw Error('簡報含巨集或 ActiveX，請在本機另存無巨集 PPTX。');
      }
      if (parts.has(entry.filename)) throw Error('簡報內有重複來源路徑。請在 PowerPoint 重新另存 PPTX。');
      parts.set(entry.filename, entry);
    }
    const archive = {file(path) {
      const entry = parts.get(path);
      return entry ? slidePart(entry) : null;
    }};
    const document = await inspectMarketing(archive, options);
    return {document, sha256: await hashFile(file, options.onProgress)};
  } catch (error) {
    if (/[\u3400-\u9fff]/u.test(error.message)) throw error;
    throw Error('無法讀取 PPTX 封裝或內部內容。請確認可在 PowerPoint 開啟，再另存新的 PPTX 副本。');
  } finally {
    await reader.close();
  }
}
