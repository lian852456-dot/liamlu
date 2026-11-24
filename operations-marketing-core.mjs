// Bounded OOXML inspection. Only relationships within the selected package are opened.
const MAX_SLIDE_XML = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGES = 80;
const MIN_CONFIDENCE = 65;

function decode(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, entity => {
    const key = entity.slice(1, -1);
    const basic = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}[key];
    if (basic) return basic;
    const point = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}

const elements = (xml, name) => Array.from(
  xml.matchAll(new RegExp(`<(?:[\\w]+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w]+:)?${name}>`, 'g'))
);
const tags = (xml, name) => Array.from(
  xml.matchAll(new RegExp(`<(?:[\\w]+:)?${name}\\b[^>]*>`, 'g')), match => match[0]
);
const attr = (xml, key) => decode(xml.match(new RegExp(`\\s${key}=(?:"([^"]*)"|'([^']*)')`))?.slice(1).find(value => value !== undefined) || '');
const tidy = value => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[^\S\n]+/g, ' ').trim();
const textRuns = xml => elements(xml, 't').map(([element]) => decode(element.replace(/^<[^>]+>|<\/[^>]+>$/g, '')));
const hidden = shape => /\bhidden=(?:"(?:1|true)"|'(?:1|true)')/i.test(shape);

function safeXml(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('不支援含外部實體的簡報，請在本機另存無外部實體 PPTX。');
  return xml;
}

function resolvePart(directory, target, allowedPath) {
  if (!target || /[:\\?#%]/.test(target)) return '';
  const parts = target.startsWith('/') ? [] : directory.split('/');
  for (const part of target.split('/').filter(Boolean)) {
    if (part === '..' && !parts.length) return '';
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  const path = parts.join('/');
  return allowedPath.test(path) ? path : '';
}

const matchFields = [
  {kind: 'product', label: '主推商品／方案', pattern: /主推(?:商品|服務|方案)?|促銷方案|優惠方案|商品名稱|專案名稱|活動名稱|(?:^|[\s｜：:])(?:商品|服務|方案)(?:$|[\s｜：:])|\b(?:featured product|offer name)\b/i},
  {kind: 'customer', label: '適用客群／申辦資格', pattern: /適用客群|適用對象|目標客群|申辦資格|申請資格|適用資格|資格條件|適用於|限(?:既有|企業|新申辦|續約|攜碼|指定客戶)|\beligibility\b/i},
  {kind: 'timing', label: '活動期間', pattern: /(?:活動|優惠|適用|促銷)(?:期間|起訖|日期)|生效日|截止日|限時|\b(?:offer period|valid until)\b/i},
  {kind: 'pricing', label: '價格／費用', pattern: /申辦價|活動價|組合價|售價|費用|月租|折抵|價格|定價|優惠價|(?:NT\$|新台幣|新臺幣)\s*[\d,]+|[\d,]+\s*元|\bprice\b/i},
  {kind: 'restriction', label: '限制／例外', pattern: /限制|不得|不適用|不可|不可併用|限購|限量|名額|數量有限|送完為止|售完為止|合約\d+個?月|\brestrictions?\b/i},
  {kind: 'operations', label: '門市執行事項', pattern: /門市(?:執行|處理|需|須|應|請|作業|動作)|執行事項|應辦事項|陳列|話術|系統登錄|門市回報|作業流程|\bstore actions?\b/i}
];

const followups = [
  {kind: 'operations', label: '門市執行建議', basedOn: ['operations'], text: '請店長逐項確認門市作業由誰執行，並記錄完成情況。'},
  {kind: 'customer', label: '客群追蹤建議', basedOn: ['product', 'customer'], text: '建議依適用客群記錄接觸量、申辦量與未申辦主因，供店長追蹤。'},
  {kind: 'restriction', label: '資格與條件複核建議', basedOn: ['timing', 'pricing', 'restriction'], text: '建議在陳列與銷售說明時核對生效日期、適用價格及例外，並回收門市遇到的疑問。'}
];

function marketingCandidates(entries) {
  const facts = [];
  const used = new Set();
  for (const {value, evidence, field} of entries) {
    for (const rule of matchFields) {
      if (!(field ? rule.pattern.test(field) : rule.pattern.test(value))) continue;
      let detail = value;
      if (!field) {
        const label = value.split(/[:：]/, 1)[0];
        if (label.length < value.length && rule.pattern.test(label)) detail = tidy(value.slice(label.length + 1));
        else if (rule.kind === 'pricing') {
          const amounts = value.match(/(?:NT\$|新[臺台]幣|\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*元/gi);
          if (amounts?.length) detail = [...new Set(amounts)].join('、');
        }
      }
      detail = detail.replace(/[。；;]+$/g, '');
      if (!detail || detail.length > 200 || (field && field === detail)) continue;
      const key = `${rule.kind}:${detail}`;
      if (used.has(key) || facts.filter(item => item.kind === rule.kind).length >= 4) continue;
      used.add(key);
      facts.push({kind: rule.kind, label: rule.label, text: detail, evidence});
    }
  }
  const suggestions = followups.flatMap(({basedOn, ...row}) => {
    const supporting = facts.find(item => basedOn.includes(item.kind));
    return supporting ? [{...row, evidence: supporting.evidence}] : [];
  });
  return {facts, suggestions};
}

function sourceEntries(lines, rows) {
  const entries = lines.flatMap(value => value.split(/(?<=[。；])\s*|\s{2,}/).filter(Boolean))
    .map(value => ({value: tidy(value), evidence: tidy(value)}));
  const isField = cell => cell && cell.length <= 28 && matchFields.some(rule => rule.pattern.test(cell));
  for (const table of rows) {
    const [head, ...data] = table;
    const isHeaderRow = head.filter(isField).length >= 2 && (head.length > 2 || data.some(row => row[0] && !isField(row[0])));
    if (isHeaderRow) {
      for (const row of data) {
        const evidence = `${head.join(' ｜ ')}\n${row.join(' ｜ ')}`;
        for (const [index, value] of row.entries()) {
          const field = head[index];
          if (isField(field) && value) entries.push({field, value, evidence: evidence.length <= 900 ? evidence : `${field} ｜ ${value}`});
        }
      }
    } else {
      for (const row of table) {
        const [field, ...cells] = row;
        if (isField(field) && cells.some(Boolean)) entries.push({field, value: cells.filter(Boolean).join('、'), evidence: row.join(' ｜ ')});
      }
    }
  }
  return entries;
}

export function summarizeMarketingPage(value) {
  const lines = tidy(String(value || '')).split('\n').map(tidy).filter(Boolean);
  return marketingCandidates(sourceEntries(lines, []));
}

function createPage({page, sourcePage = page, pageLabel = `第 ${sourcePage} 頁`, lines = [], tables = [], imageCount = 0, covered = false, issues = [], methods = [], imageReview = false}) {
  if (!lines.length && !tables.length && !issues.length) issues.push('找不到可讀取的頁面文字。請提供清晰的原頁圖片或逐頁補註。');
  const content = [...lines, ...tables.flatMap(table => table.map(row => row.join(' ｜ ')))].join('\n');
  const excerpt = content.slice(0, 2400);
  const hasText = !!content;
  const readState = hasText ? issues.length ? 'partial' : 'read' : 'unread';
  const periods = [...new Set(content.match(/20\d{2}\s*[年./-]\s*\d{1,2}(?:\s*月(?:\s*\d{1,2}\s*日)?|[./-]\s*\d{1,2})?|\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?|\b\d{1,2}\/\d{1,2}\b/g) || [])].slice(0, 30);
  const status = readState === 'read' ? '已讀取，待逐頁核對' : readState === 'partial' ? '部分內容需補資料' : '未取得可用文字';
  return {
    page, sourcePage, pageLabel, readState, status, methods: [...new Set(methods)], issues, imageReview,
    text: excerpt, truncated: content.length > excerpt.length, imageCount, covered, periods,
    ...marketingCandidates(sourceEntries(lines, tables))
  };
}

function createSource(pages, contract) {
  const readState = pages.every(page => page.readState === 'read') ? 'read' : pages.some(page => page.readState !== 'unread') ? 'partial' : 'unread';
  return {
    contract, pages, readState, pageCount: pages.length,
    caution: '分類重點依頁面文字及表格欄位整理。活動生效、資費、申辦限制與圖片辨識結果須回到原頁核對；推動建議另列。'
  };
}

function shapeLines(xml) {
  const paragraphs = elements(xml, 'p').map(([p]) => tidy(textRuns(p).join('')));
  return (paragraphs.length ? paragraphs : textRuns(xml).map(tidy)).filter(Boolean);
}

function slideNative(xml, blocker) {
  // Preserve table columns and paragraph boundaries. Hidden shapes and text behind
  // an opaque-looking foreground image are held back for full-slide manual review.
  const lines = elements(xml, 'sp').flatMap(match => {
    const shape = match[0];
    if (match.index < blocker || hidden(shape)) return [];
    return shapeLines(shape);
  });
  const tables = elements(xml, 'tbl').flatMap(match => {
    if (match.index < blocker) return [];
    const table = elements(match[0], 'tr')
      .map(([row]) => elements(row, 'tc').map(([cell]) => shapeLines(cell).join(' ')))
      .filter(row => row.some(Boolean));
    return table.length ? [table] : [];
  });
  return {lines, tables};
}

export function imageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if ([137,80,78,71,13,10,26,10].every((value, i) => b[i] === value)) return 'image/png';
  if ([255,216,255].every((value, i) => b[i] === value)) return 'image/jpeg';
  if ([82,73,70,70].every((value, i) => b[i] === value) && [87,69,66,80].every((value, i) => b[i + 8] === value)) return 'image/webp';
  return '';
}

async function recognizeImage(bytes, ocr, label, progress) {
  const type = imageType(bytes);
  if (!type) return {issue: `${label}格式不支援 OCR，請在本機匯出 PNG、JPEG 或 WebP。`};
  if (bytes.byteLength > MAX_IMAGE_BYTES) return {issue: `${label}超過 30 MiB，請在本機縮小圖片後重選。`};
  if (!ocr) return {issue: `${label}尚未 OCR，請提供可讀文字版，或逐頁補註。`};
  try {
    const {text, confidence} = await ocr(bytes, type, progress);
    const lines = tidy(String(text || '')).split('\n').map(tidy).filter(Boolean);
    if (!lines.length) return {issue: `${label}經 OCR 未找到文字；若原頁含政策，請提供較清晰圖片或人工補註。`};
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
      return {issue: `${label}文字辨識可信度偏低。請提供較清晰的原頁圖片或依原頁人工補註。`};
    }
    return {lines};
  } catch {
    return {issue: `${label}本機 OCR 無法完成。請重讀；仍失敗時請提供清晰圖片或人工補註。`};
  }
}

export async function inspectMarketingImage(bytes, name, {ocr, onProgress} = {}) {
  const match = name.match(/(?:第\s*(\d{1,3})\s*[頁页]|(?:^|[ _.-])(?:page|p)[._ -]?(\d{1,3})(?=$|[ _.-]))/i);
  const sourcePage = Number(match?.[1] || match?.[2]) || null;
  const label = sourcePage ? `第 ${sourcePage} 頁（檔名）` : '單張圖片（原頁碼待核）';
  const result = await recognizeImage(bytes, ocr, '圖片', onProgress);
  const page = createPage({
    page: 1, sourcePage, pageLabel: label, lines: result.lines, imageCount: 1, imageReview: true,
    methods: result.lines ? ['本機 OCR'] : [], issues: result.issue ? [result.issue] : []
  });
  return createSource([page], 'operations-marketing-image-v1');
}

export async function inspectMarketing(zip, {ocr, onProgress} = {}) {
  const presentation = safeXml(await zip.file('ppt/presentation.xml')?.async('string') || '');
  const rels = safeXml(await zip.file('ppt/_rels/presentation.xml.rels')?.async('string') || '');
  if (!presentation || !rels) throw Error('不是可讀取的 PPTX。舊版 PPT 請在自己的 PowerPoint 另存無巨集 PPTX。');
  const relationships = new Map(tags(rels, 'Relationship').map(rel => [attr(rel, 'Id'), rel]));
  const slides = tags(presentation, 'sldId');
  if (!slides.length || slides.length > 200) throw Error('行銷簡報需為 1–200 頁，請依當期章節分檔。');
  const size = tags(presentation, 'sldSz')[0] || '';
  const width = Number(attr(size, 'cx'));
  const height = Number(attr(size, 'cy'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw Error('簡報缺少頁面尺寸，請在本機另存 PPTX。');
  }
  const seenPictures = new Map();
  const pages = [];

  for (const [index, slide] of slides.entries()) {
    const page = index + 1;
    const rel = relationships.get(attr(slide, 'r:id')) || '';
    const path = resolvePart('ppt', attr(rel, 'Target'), /^ppt\/slides\/slide\d+\.xml$/);
    const file = !attr(rel, 'TargetMode') && zip.file(path);
    if (!file) {
      pages.push(createPage({page, issues: ['簡報頁面遺失或連到外部檔案。請提供這一頁的本機匯出圖片或重存 PPTX。']}));
      continue;
    }
    const xml = safeXml(await file.async('string'));
    if (xml.length > MAX_SLIDE_XML) {
      pages.push(createPage({page, issues: ['單頁內容過大。請在本機將此頁另存成圖片後讀取。']}));
      continue;
    }
    const pictures = elements(xml, 'pic').filter(([picture]) => !hidden(picture));
    let blocker = -1;
    for (const pic of pictures) {
      const ext = tags(pic[0], 'ext').find(tag => attr(tag, 'cx') && attr(tag, 'cy')) || '';
      if (Number(attr(ext, 'cx')) >= width * .8 && Number(attr(ext, 'cy')) >= height * .8) blocker = pic.index;
    }
    const groupedPictures = elements(xml, 'grpSp').some(([group]) => /<(?:\w+:)?pic\b/.test(group));
    const backgroundImage = elements(xml, 'bg').some(([background]) => /<(?:\w+:)?blip\b/.test(background));
    if (groupedPictures) blocker = xml.length;
    const issues = [];
    const {lines, tables} = slideNative(xml, blocker);
    const methods = [];
    if (lines.length) methods.push('原生文字');
    if (tables.length) methods.push('可編輯表格');
    if (groupedPictures || backgroundImage) issues.push('群組或背景圖片的可見範圍需核對，請提供這頁的完整匯出圖片或逐頁補註。');
    if (elements(xml, 'graphicFrame').some(([graphic]) => !tags(graphic, 'tbl').length)) {
      issues.push('此頁有圖表或其他嵌入物件。請提供這頁的完整匯出圖片及需要引用的數據，或逐頁補註。');
    }
    if (pictures.length) {
      const slideRels = safeXml(await zip.file(path.replace(/\/([^/]+)$/, '/_rels/$1.rels'))?.async('string') || '');
      const media = new Map(tags(slideRels, 'Relationship').map(rel => [attr(rel, 'Id'), rel]));
      for (const [order, [picture]] of pictures.entries()) {
        const label = `圖片 ${order + 1}`;
        const crop = tags(picture, 'srcRect')[0] || '';
        const transform = tags(picture, 'xfrm')[0] || '';
        if (!['l', 't', 'r', 'b'].every(side => !Number(attr(crop, side))) || ['rot', 'flipH', 'flipV'].some(key => !['', '0', 'false'].includes(attr(transform, key)))) {
          issues.push(`${label}有裁切、旋轉或翻轉。請提供這頁的完整匯出圖片或逐頁補註。`);
          continue;
        }
        const blip = tags(picture, 'blip')[0] || '';
        const link = media.get(attr(blip, 'r:embed')) || '';
        const imagePath = !attr(link, 'TargetMode') && resolvePart('ppt/slides', attr(link, 'Target'), /^ppt\/media\/[^/]+$/);
        const asset = imagePath && zip.file(imagePath);
        if (!asset) {
          issues.push(`${label}素材遺失或連到外部檔案，尚未 OCR；請提供這頁的完整匯出圖片或逐頁補註。`);
          continue;
        }
        if (!seenPictures.has(imagePath)) {
          if (seenPictures.size >= MAX_IMAGES) {
            issues.push(`${label}超過每份簡報的圖片辨識上限。請分檔或另傳這一頁的圖片。`);
            continue;
          }
          onProgress?.(`第 ${page}／${slides.length} 頁，辨識${label}`);
          try {
            const result = await recognizeImage(await asset.async('uint8array'), ocr, label, () => onProgress?.(`第 ${page}／${slides.length} 頁，辨識${label}`));
            seenPictures.set(imagePath, result);
          } catch {
            seenPictures.set(imagePath, {issue: `${label}無法解開內嵌素材，請提供這頁的完整匯出圖片或逐頁補註。`});
          }
        }
        const result = seenPictures.get(imagePath);
        if (result.lines) {
          lines.push(...result.lines);
          methods.push('本機 OCR');
        } else issues.push(result.issue.replace(/^圖片 \d+/, label));
      }
    }
    pages.push(createPage({page, lines, tables, methods, issues, imageCount: pictures.length, covered: blocker >= 0, imageReview: !!pictures.length || backgroundImage}));
  }
  return createSource(pages, 'operations-marketing-pptx-v2');
}
