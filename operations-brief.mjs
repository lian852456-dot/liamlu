import {createSupervisorAccess} from './tradein-supervisor-auth.mjs?v=20261012-supervisor-1';
import {SECTIONS, validateFile, draftMetadata} from './operations-brief-core.mjs?v=20261124-operations-review';
import * as marketing from './operations-marketing-core.mjs?v=20261124-operations-review';
import {combineMonthlyReportSections} from './operations-report-core.mjs';

const $ = id => document.getElementById(id);
const MARKETING = '行銷簡報';
const SUPPLEMENT = '綜合公司原檔';
const TEMPLATE = 'templateFile';
const CHAPTERS = [[MARKETING, '全檔或逐頁原始素材、當期活動期間、範圍及適用條件'], ...SECTIONS.map(([name, , need]) => [name, need])];
const SCOPES = ['北一二全四區', '北一二A', '北一二B', '北一二C', '北一二D', '北一處', '全公司／全通路', '其他範圍'];
const TOPICS = {
  '店務': [['storeDeficiencies', '當月未滿分／缺失']],
  '舊換新': [['tradeinPolicy', '當期舊換新政策']],
  '新復原者／保險': [['insurancePolicy', '新復原者政策'], ['insurancePerformance', '保險搭售與同期比較'], ['insuranceComparison', '保險方案／級距比較']]
};
const fileInputs = () => Array.from(document.querySelectorAll('input[type=file]'));
const parsed = new Map();
const sourceStates = new Map();
const pending = new Map();
const urls = new Set();
const previewUrls = new Set();
let template = null;
let worker = null;
let busy = false;
let generation = 0;
let sequence = 0;

function element(parent, tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function field(parent, caption, tag = 'input', value = '') {
  const label = element(parent, 'label', caption);
  const input = element(label, tag);
  input.value = value;
  return input;
}

function option(select, value, label = value) {
  const row = element(select, 'option', label);
  row.value = value;
}

function button(parent, label, action) {
  const node = element(parent, 'button', label, 'secondary');
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

SECTIONS.forEach(([name, , need], index) => {
  const input = field($('categoryInputs'), name + '來源');
  input.type = 'file';
  input.id = 'categorySource' + index;
  input.multiple = true;
  input.accept = '.xlsx,.xls,.csv,.pptx,.pdf,.png,.jpg,.jpeg,.webp';
  input.dataset.companySource = '';
  input.dataset.category = name;
  const help = element(input.parentElement, 'small', need);
  if (name === '好速長約' || name === '好速失敗原因') help.append(' 可選同一份 BB 三表活頁簿，各章節分別核對。');
  help.id = input.id + 'Hint';
  input.setAttribute('aria-describedby', help.id);
});

function status(message, error = false, node = $('status')) {
  node.textContent = message;
  node.classList.toggle('error', error);
}

function resetConfirmation() {
  $('acknowledge').checked = false;
  status('', false, $('exportStatus'));
}

function stopWorker() {
  worker?.terminate();
  worker = null;
  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(new DOMException('已中止本機處理。', 'AbortError'));
  }
  pending.clear();
}

function clearData(message) {
  generation++;
  stopWorker();
  busy = false;
  parsed.clear();
  sourceStates.clear();
  template = null;
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  $('marketingComplete').checked = false;
  for (const input of fileInputs()) input.value = '';
  $('goodSpeedPassword').value = '';
  $('highlights').value = '';
  resetConfirmation();
  render();
  status(message || '已清除本頁檔案與核對結果。請重新選檔。');
}

function lock(error) {
  $('workspace').hidden = true;
  $('workspace').inert = true;
  $('authPanel').hidden = false;
  $('passcode').value = '';
  clearData();
  const hadFiles = error?.code !== 'AUTH_TOKEN_MISSING';
  $('authStatus').textContent = (error?.message || '請完成督導驗證。') +
    (hadFiles ? ' 本機資料已清除。重新驗證後請再選檔。' : '');
}

const access = createSupervisorAccess({onRevoke: lock});

async function verify(key) {
  await access.verify(key === undefined ? {} : {key});
  access.requireCurrent();
  $('workspace').hidden = false;
  $('workspace').inert = false;
  $('authPanel').hidden = true;
  updateControls();
}

function startWorker() {
  if (worker) return;
  worker = new Worker('./operations-brief-worker.js?v=20261124-operations-review');
  worker.onmessage = ({data}) => {
    const job = pending.get(data.id);
    if (!job) return;
    if (typeof data.progress === 'string') {
      clearTimeout(job.timer);
      job.timer = setTimeout(job.expire, job.timeout);
      status(data.progress);
      return;
    }
    clearTimeout(job.timer);
    pending.delete(data.id);
    if (data.error) job.reject(Error(data.error));
    else job.resolve(data.result);
  };
  worker.onerror = () => {
    const jobs = Array.from(pending.values());
    pending.clear();
    stopWorker();
    for (const job of jobs) {
      clearTimeout(job.timer);
      job.reject(Error('本機讀取程式中斷。請重新整理後再試。'));
    }
  };
}

function job(type, values = {}, transfer = []) {
  startWorker();
  const id = ++sequence;
  const timeout = values.category === MARKETING ? 300000 : 90000;
  return new Promise((resolve, reject) => {
    const expire = () => {
      pending.delete(id);
      stopWorker();
      reject(Error('本機讀取逾時。請將大型檔案分成數份，或改用原生文字版。'));
    };
    const timer = setTimeout(expire, timeout);
    pending.set(id, {resolve, reject, timer, timeout, expire});
    worker.postMessage({id, type, ...values}, transfer);
  });
}

function locationLabel(page) {
  return page.pageLabel || '第' + page.page + '頁';
}

function reportPart(source) {
  return (source.report?.sections || source.sections || []).find(section => section.key === source.category);
}

function sourceLocations(source) {
  return Array.from(new Set([
    ...(source.sheets || []).flatMap(sheet => [sheet.name]),
    ...(reportPart(source)?.evidence || []).flatMap(evidence => [sheetLocation(evidence), evidence.sheet]),
    ...reportTables(source).map(table => table.locator),
    ...(source.document?.pages || []).map(locationLabel),
    ...(source.marketing?.pages || []).map(locationLabel),
    ...Array.from(source.decisions?.values() || [], decision => decision.locator),
    ...(source.kind === 'image' ? ['第1頁'] : [])
  ].filter(Boolean)));
}

const sourceList = () => Array.from(parsed.values()).flat();
const chapterSources = name => sourceList().filter(source => source.category === name);
const selectedCount = name => fileInputs().filter(input => input.dataset.category === name).reduce((sum, input) => sum + input.files.length, 0);
const supporting = source => source.review?.confirmed && source.review.facts.length > 0;
const sheetLocation = evidence => [evidence.sheet, evidence.locator].filter(Boolean).join(' · ');

function reportTables(source) {
  const part = reportPart(source);
  if (!part?.rows?.length || !part.evidence?.length) return [];
  const {evidence, headers} = part;
  const monthly = ['店務','金牌'].includes(source.category);
  const [locator, ...additionalLocators] = evidence.map(sheetLocation);
  const data = monthly
    ? part.months.flatMap((month, index) => {
        if (!evidence[index]) return [];
        const rows = part.rows.filter(row => row[0] === month);
        return rows.length ? [{headers, rows, locator: sheetLocation(evidence[index]), title: month}] : [];
      })
    : [{headers, rows: part.rows, locator, additionalLocators, topic: source.category === '新復原者／保險' ? 'insurancePerformance' : ''}];
  for (const extra of part.additionalTables || []) {
    if (!extra.rows.length) continue;
    const isStore = source.category === '店務';
    const exact = extra.evidence ? sheetLocation(extra.evidence) : '';
    data.push({...extra, locator: exact || (isStore ? sheetLocation(evidence.at(-1)) : locator),
      additionalLocators: exact || isStore ? [] : additionalLocators, topic: isStore ? 'storeDeficiencies' : ''});
  }
  return data;
}

function sourceStatus(source) {
  if (source.error) return ['讀取失敗', 'pending'];
  if (supporting(source)) return ['已完成來源核對', 'verified'];
  if (source.review?.facts.length) return ['已採用部分內容，尚有頁面待核', 'pending'];
  if (source.review?.confirmed && source.category === MARKETING) return ['已核對，本次不採用', 'muted'];
  if (source.needsPassword || reportPart(source)?.status === 'error') return ['部分內容無法辨識', 'pending'];
  if (source.marketing && source.marketing.pages.some(page => page.readState !== 'read')) return ['部分頁面需補註', 'pending'];
  if (!sourceLocations(source).length || reportPart(source)?.status === 'partial') return ['部分內容待對映', 'pending'];
  return ['已讀取，等待核對', 'muted'];
}

function chapterInfo(name) {
  const items = chapterSources(name);
  const selected = selectedCount(name);
  if (!selected) return {status: 'missing', label: '尚未選檔'};
  if (items.length < selected) return {status: 'selected', label: '已選檔，等待讀取'};
  if (items.every(source => source.error)) return {status: 'error', label: '讀取失敗，請查看原因'};
  const facts = items.flatMap(source => source.review?.facts || []);
  const recommendations = items.flatMap(source => source.review?.recommendations || []);
  const tables = items.flatMap(source => source.review?.confirmed ? source.review.tables : []);
  const monthly = ['店務','金牌'].includes(name);
  const data = items.filter(source => supporting(source) && source.review.tables.length)
    .map(source => ({...reportPart(source), sourceSha256: source.sha256}));
  const current = monthly ? combineMonthlyReportSections(name, data, $('meeting').value) : null;
  const expected = name === MARKETING
    ? $('marketingComplete').checked && items.every(source => source.review?.originalPages)
    : (monthly ? current.complete : items.some(source => hasVerifiedData(source))) &&
      (TOPICS[name] || []).every(([topic]) => [...facts, ...tables].some(item => item.topic === topic));
  const verified = Boolean(facts.length && expected && items.every(source => source.review?.confirmed));
  const period = Array.from(new Set(items.map(source => source.period || reportPart(source)?.sourcePeriod).filter(Boolean))).join('、');
  const coverage = Array.from(new Set(items.map(source => source.coverage || reportPart(source)?.coverage).filter(Boolean))).join('、');
  const partial = items.some(source => sourceStatus(source)[1] === 'pending') || Boolean(facts.length);
  return {
    status: verified ? 'verified' : partial ? 'partial' : 'read',
    label: verified ? '已完成來源核對' : facts.length ? '已採用部分內容，待補齊' : partial ? '部分內容待補或核對' : '已讀取，等待核對',
    period,
    coverage,
    facts,
    recommendations,
    tables,
    issues: current?.issues || []
  };
}

function hasVerifiedData(source) {
  if (!supporting(source) || source.coverage !== '北一二全四區' || !source.review.tables.length) return false;
  const part = reportPart(source);
  if (part?.status !== 'read' || part.coverage !== '北一二全四區') return false;
  return part.months?.includes($('meeting').value);
}

function previousMonth(month) {
  const [year, value] = month.split('-').map(Number);
  if (!year || !value) return '';
  return new Date(Date.UTC(year, value - 2, 1)).toISOString().slice(0, 7);
}

function metadata() {
  const sections = Object.fromEntries(CHAPTERS.map(([name]) => [name, chapterInfo(name)]));
  const sources = sourceList().filter(source => !source.error).map(source => ({
    ...source,
    sourcePeriod: source.period || '',
    coverage: source.coverage || '',
    status: sourceStatus(source)[1] === 'verified' ? 'verified' : source.needsPassword ? 'partial' : 'read',
    reviewableLocators: sourceLocations(source)
  }));
  const result = draftMetadata({meeting: $('meeting').value, highlights: $('highlights').value, sections}, sources, template);
  result.attempts = sourceList().map(source => ({
    name: source.name, chapter: source.category,
    status: sourceStatus(source)[0],
    issues: [source.error, ...(reportPart(source)?.issues || [])].filter(Boolean),
    pages: (source.marketing?.pages || []).map(page => ({
      locator: source.decisions?.get(locationLabel(page))?.locator || locationLabel(page),
      status: source.decisions?.get(locationLabel(page))?.label || page.status,
      methods: page.methods,
      issues: page.issues
    }))
  }));
  return result;
}

function updateControls() {
  const active = !busy && !$('workspace').hidden && access.current();
  for (const input of [...fileInputs(), $('meeting'), $('goodSpeedPassword'), $('marketingComplete')]) input.disabled = !active;
  for (const node of $('inventory').querySelectorAll('button,input,textarea,select')) node.disabled = !active;
  $('readFiles').disabled = !active || !fileInputs().some(input => input.files.length);
  $('highlights').disabled = !active;
  $('acknowledge').disabled = !active;
  let meta;
  if (template && $('meeting').value) {
    try { meta = metadata(); } catch { /* Input validation is shown by the export action. */ }
  }
  const verified = meta?.status === 'READY_VERIFIED';
  $('reportState').textContent = !template ? '請先讀取上月原始範本。來源核對摘要可先下載。' : verified
    ? '本次來源已核對，確認後可產出本月簡報。'
    : '仍有來源或章節待核。可輸出有缺口標示的待核簡報。';
  $('download').textContent = verified ? '下載本月簡報（PPTX）' : '下載待核簡報（PPTX）';
  $('download').disabled = !active || !template || !$('meeting').value || !$('acknowledge').checked;
  $('audit').disabled = !active || !sourceList().length || !$('meeting').value;
}

function renderMapping() {
  $('mapping').replaceChildren();
  for (const [name, requirement] of CHAPTERS) {
    const info = chapterInfo(name);
    const row = element($('mapping'), 'tr');
    const head = element(row, 'th', name);
    head.scope = 'row';
    const state = element(row, 'td', info.label, info.status === 'verified' ? 'verified' : '');
    if (info.status !== 'verified') element(state, 'small', requirement);
    if (info.status !== 'verified') for (const issue of info.issues || []) element(state, 'small', issue);
    element(row, 'td', [info.period, info.coverage].filter(Boolean).join(' · ') || '待核');
  }
}

function refresh() {
  resetConfirmation();
  renderMapping();
  updateControls();
}

function sourceDetails(source, parent) {
  const caption = element(parent, 'p');
  const present = element(parent, 'p', source.inspection || source.error || '', source.error ? 'error' : '');
  if (!present.textContent) present.remove();
  const paint = () => {
    const [value, color] = sourceStatus(source);
    caption.textContent = value;
    caption.className = color;
    refresh();
  };
  const [value, color] = sourceStatus(source);
  caption.textContent = value;
  caption.className = color;
  return paint;
}

function reportingEvidence(parent, source) {
  const part = reportPart(source);
  for (const sheet of source.sheets || []) {
    const details = element(parent, 'details');
    element(details, 'summary', '工作表 ' + sheet.name + (sheet.range ? ' · ' + sheet.range : ''));
    if (sheet.fields?.length) element(details, 'p', '辨識欄位 ' + sheet.fields.join('、'));
    if (sheet.periods?.length) element(details, 'small', '檔內期間 ' + sheet.periods.join('、'));
    if (sheet.scopes?.length) element(details, 'small', '檔內涵蓋範圍 ' + sheet.scopes.join('、'));
  }
  for (const issue of part?.issues || []) element(parent, 'p', issue, 'pending');
  for (const evidence of part?.evidence || []) {
    if (evidence.locator) element(parent, 'small', '來源位置 ' + sheetLocation(evidence));
  }
  for (const message of part?.notes || []) element(parent, 'small', message);
  for (const table of [part, ...(part?.additionalTables || [])].filter(item => item?.rows?.length && item.headers?.length)) {
    renderTable(parent, table);
  }
  for (const page of source.document?.pages || []) {
    const details = element(parent, 'details');
    element(details, 'summary', locationLabel(page) + ' · ' + page.status);
    if (page.text) element(details, 'div', page.text, 'source-excerpt');
    for (const issue of page.issues || []) element(details, 'small', issue);
  }
}

function renderTable(parent, data) {
  if (data.title) element(parent, 'h3', data.title);
  const scroll = element(parent, 'div', '', 'table-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-label', '來源彙總預覽');
  const table = element(scroll, 'table');
  const head = element(element(table, 'thead'), 'tr');
  for (const text of data.headers) element(head, 'th', text).scope = 'col';
  const body = element(table, 'tbody');
  for (const values of data.rows) {
    const row = element(body, 'tr');
    for (const text of values) element(row, 'td', text ?? '');
  }
}

function evidenceEntry(source, text, locator, topic) {
  return {text, sourceSha256: source.sha256, sourceName: source.name, locator, ...(topic ? {topic} : {})};
}

function normalizeScope(input) {
  return ({'北一二部': '北一二全四區', '直營四區': '北一二全四區', '北一二部直營四區': '北一二全四區', '北一二 A／B／C／D': '北一二全四區'})[input] || input;
}

function periodIsValid(source) {
  if (!source.period || !source.coverage) throw Error('請先填寫來源期間，並選擇原檔的涵蓋範圍。');
  const period = source.period.replace(/(20\d{2})[/.年-](\d{1,2})(?:月)?/g, (_, year, month) => year + '-' + month.padStart(2, '0'));
  const meeting = $('meeting').value;
  const prior = previousMonth(meeting);
  if (!period.includes(meeting) && !(source.category === '店務' && period.includes(prior)) &&
      source.category !== '金牌' && (source.category === MARKETING || !reportPart(source)?.months?.length)) {
    throw Error('請依原檔標註與本次會議相關的資料或政策期間（含西元年及月）。');
  }
  const cutoff = reportPart(source)?.cutoff;
  if (cutoff) {
    const normalized = source.period.replace(/[/.年月]/g, '-').replace(/日/g, '').replace(/-(\d)(?=\D|$)/g, '-0$1');
    if (!normalized.includes(cutoff)) throw Error('核對期間須包含原表截止日 ' + cutoff + '。');
  }
  const part = reportPart(source);
  const undatedTradeIn = source.category === '舊換新' && !part?.cutoff &&
    part?.sourcePeriod?.match(/\b(\d{1,2})\s*[/.月]\s*\d{1,2}\s*(?:[~～–—至-])/);
  if (undatedTradeIn && Number(undatedTradeIn[1]) !== Number(meeting.slice(5))) {
    throw Error('原表列示 ' + part.sourcePeriod + '，月份與本次會議不符。請選當期原檔。');
  }
  const knownScope = normalizeScope(part?.coverage);
  if (SCOPES.includes(knownScope) && source.coverage !== knownScope) {
    throw Error('原檔涵蓋範圍為「' + knownScope + '」。請依實際範圍核對。');
  }
  if (part?.months?.length && !part.months.includes(meeting) &&
      !['店務','金牌'].includes(source.category)) {
    throw Error('原報表資料期間不含本次會議月。請選本期原檔。');
  }
}

function sourceFields(parent, source, reset) {
  const grid = element(parent, 'div', '', 'field-grid');
  const part = reportPart(source);
  const period = field(grid, '來源期間／政策生效版本', 'input', source.period || part?.sourcePeriod || '');
  period.maxLength = 100;
  period.placeholder = '例：2026-11-01 至 2026-11-24';
  const coverage = field(grid, '涵蓋範圍', 'select');
  option(coverage, '', '選擇來源涵蓋範圍');
  const knownCoverage = normalizeScope(part?.coverage);
  const scopes = new Set([...SCOPES, knownCoverage].filter(Boolean));
  for (const scope of scopes) option(coverage, scope);
  coverage.value = source.coverage || knownCoverage || '';
  const set = () => {
    source.period = period.value.trim();
    source.coverage = coverage.value;
  };
  set();
  for (const input of [period, coverage]) input.addEventListener('input', () => {
    set();
    source.review = null;
    $('highlights').value = '';
    if (source.category === MARKETING) $('marketingComplete').checked = false;
    reset();
  });
}

function renderReportReview(parent, source, paint) {
  const locations = sourceLocations(source);
  reportingEvidence(parent, source);
  if (source.error || !locations.length || source.needsPassword || source.category === SUPPLEMENT) return;
  const part = reportPart(source);
  source.entries ||= [];
  const grid = element(parent, 'div', '', 'field-grid');
  const locator = field(grid, '重點的工作表／頁碼', 'select');
  for (const location of locations) option(locator, location);
  const topic = field(grid, '內容項目', 'select');
  option(topic, '', '當期成果／改善依據');
  for (const [id, label] of TOPICS[source.category] || []) option(topic, id, label);
  const input = field(parent, '可納入報告的核對重點', 'textarea');
  input.rows = 2;
  input.maxLength = 300;
  input.placeholder = '只填原檔已核實的去識別彙總或政策。可逐筆選取來源位置。';
  const facts = element(parent, 'ul', '', 'evidence-list');
  const feedback = element(parent, 'p', '', 'status');
  let useTable = null;
  let complete = null;
  const reset = () => {
    source.entries = [];
    if (useTable) useTable.checked = false;
    if (complete) complete.checked = false;
    input.value = '';
    redraw();
    paint();
  };
  sourceFields(parent, source, reset);
  function redraw() {
    facts.replaceChildren();
    for (const fact of source.entries) {
      const line = element(facts, 'li', fact.text + ' · ' + fact.locator + ' ');
      button(line, '移除', () => {
        source.entries = source.entries.filter(entry => entry !== fact);
        source.review = null;
        redraw();
        paint();
      });
    }
  }
  redraw();
  button(parent, '加入本期重點', () => {
    try {
      periodIsValid(source);
      if (!input.value.trim()) throw Error('請先填寫要納入本期的核對重點。');
      source.entries.push(evidenceEntry(source, input.value.trim(), locator.value, topic.value));
      input.value = '';
      source.review = null;
      redraw();
      paint();
      status('已加入。完成本檔核對後才會納入匯出。', false, feedback);
    } catch (error) { status(error.message, true, feedback); }
  });
  if (part?.rows?.length && part.headers?.length) {
    const label = element(parent, 'label', '', 'check');
    useTable = element(label, 'input');
    useTable.type = 'checkbox';
    label.append('納入畫面中的來源彙總表');
    useTable.checked = Boolean(source.review?.tables?.length);
  }
  const attestation = element(parent, 'label', '', 'check');
  complete = element(attestation, 'input');
  complete.type = 'checkbox';
  complete.checked = Boolean(source.review?.complete);
  attestation.append('已確認引用位置、期間及範圍，且補齊這份來源的對映缺口');
  for (const checkbox of [useTable, complete].filter(Boolean)) checkbox.addEventListener('change', () => {
    source.review = null;
    paint();
  });
  const confirm = button(parent, '確認此檔來源', () => {
    try {
      periodIsValid(source);
      const facts = [...source.entries];
      const tables = [];
      if (useTable?.checked) {
        for (const table of reportTables(source)) tables.push({...table, ...evidenceEntry(source, '', table.locator, table.topic)});
        if (!tables.length) throw Error('這張表缺少可追溯的工作表位置。');
        if (!facts.length) facts.push(evidenceEntry(source, '本期數據見來源彙總表。', tables[0].locator));
      }
      if (!facts.length) throw Error('請加入至少一筆核對重點，或採用可讀取的來源彙總表。');
      if (!complete.checked) throw Error('請確認本檔的引用位置、期間與缺口。');
      source.review = {confirmed: true, complete: true, facts, tables, recommendations: []};
      paint();
      status('此檔已完成核對。全章節狀態見上方表格。', false, feedback);
    } catch (error) { status(error.message, true, feedback); }
  });
  confirm.classList.add('confirm-source');
}

function suggestionText(item) {
  return item.label ? item.label + '｜' + item.text : item.text;
}

function renderMarketing(parent, source, paint) {
  if (source.error || !source.marketing?.pages?.length) return;
  source.decisions ||= new Map();
  const pages = source.marketing.pages;
  const extras = element(parent, 'div');
  const drawPages = element(parent, 'div');
  const reset = () => {
    source.decisions.clear();
    draw();
    paint();
  };
  sourceFields(extras, source, reset);
  function draw() {
    drawPages.replaceChildren();
    for (const page of pages) {
      const location = locationLabel(page);
      const panel = element(drawPages, 'details', '', 'page-review');
      const saved = source.decisions.get(location);
      const heading = element(panel, 'summary', location + ' · ' + (saved ? saved.label : page.status));
      if (pages.length === 1) panel.open = true;
      if (page.methods?.length) element(panel, 'small', '讀取方式 ' + page.methods.join('、'));
      if (page.periods?.length) element(panel, 'small', '原頁期間 ' + page.periods.join('、'));
      for (const issue of page.issues || []) element(panel, 'p', typeof issue === 'string' ? issue : issue.message, 'pending');
      if (source.kind === 'image' && source.file) {
        const preview = element(panel, 'details');
        element(preview, 'summary', '檢視本機原圖');
        preview.addEventListener('toggle', () => {
          if (!preview.open || preview.querySelector('img')) return;
          const url = URL.createObjectURL(source.file);
          previewUrls.add(url);
          const image = element(preview, 'img', '', 'source-image');
          image.alt = source.name;
          image.src = url;
        });
      }
      if (page.text) {
        const raw = element(panel, 'details');
        element(raw, 'summary', '查看原頁讀取文字');
        element(raw, 'div', page.text, 'source-excerpt');
      }
      const evidence = element(panel, 'div');
      let imageConfirmed;
      if (page.imageReview && page.readState === 'read') {
        const label = element(panel, 'label', '', 'check');
        imageConfirmed = element(label, 'input');
        imageConfirmed.type = 'checkbox';
        imageConfirmed.checked = Boolean(saved?.imageConfirmed);
        label.append('我已對照原圖，核對讀取的日期、價格及資格');
      }
      let originalPage;
      if (!page.sourcePage && source.kind === 'image') {
        originalPage = field(panel, '原簡報頁碼（若已知）', 'input', saved?.originalPage || '');
        originalPage.inputMode = 'numeric';
        originalPage.maxLength = 4;
        originalPage.placeholder = '保留原報告頁碼';
      }
      const editor = field(panel, '人工補註／校正文案', 'textarea', saved?.manual || '');
      editor.rows = 3;
      editor.maxLength = 6000;
      editor.placeholder = '按原頁逐項補齊。例：主推方案：…；活動期間：…；資格與限制：…';
      const info = element(panel, 'p', '', 'status');
      const actions = element(panel, 'div', '', 'actions');
      let result = saved?.manualSummary || {facts: page.facts || [], suggestions: page.suggestions || []};
      let manual = saved?.manual || '';
      function paintItems() {
        evidence.replaceChildren();
        for (const [label, items] of [['來源明確記載', result.facts || []], ['分析建議', result.suggestions || []]]) {
          element(evidence, 'h3', label);
          if (!items.length) {
            element(evidence, 'small', '這一頁尚無可採用項目。');
            continue;
          }
          const list = element(evidence, 'ul', '', 'evidence-list');
          for (const item of items) {
            const row = element(list, 'li', suggestionText(item));
            if (item.evidence) {
              const detail = element(row, 'details');
              element(detail, 'summary', '原文依據');
              element(detail, 'p', Array.isArray(item.evidence) ? item.evidence.join(' · ') : item.evidence);
            }
          }
        }
      }
      paintItems();
      const setDecision = (decision) => {
        const pageNumber = originalPage?.value.trim();
        if (pageNumber && !/^[1-9]\d{0,3}$/.test(pageNumber)) throw Error('原簡報頁碼請填正整數。');
        const locator = pageNumber ? '第 ' + pageNumber + ' 頁（人工對照原檔）' : location;
        source.decisions.set(location, {
          ...decision, locator, originalPage: pageNumber,
          facts: decision.facts.map(fact => ({...fact, locator})),
          recommendations: decision.recommendations.map(item => ({...item, locator}))
        });
        rebuildReview();
        heading.textContent = location + ' · ' + decision.label;
        paint();
      };
      function rebuildReview() {
        const decisions = Array.from(source.decisions.values());
        const confirmed = decisions.length === pages.length;
        source.review = {
          confirmed,
          originalPages: confirmed && pages.every(candidate => candidate.sourcePage || source.decisions.get(locationLabel(candidate))?.originalPage),
          facts: decisions.flatMap(row => row.facts),
          recommendations: decisions.flatMap(row => row.recommendations),
          tables: []
        };
      }
      const invalidateDecision = () => {
        source.decisions.delete(location);
        rebuildReview();
        $('marketingComplete').checked = false;
        $('highlights').value = '';
        heading.textContent = location + ' · 待核對';
        paint();
      };
      for (const input of [editor, originalPage, imageConfirmed].filter(Boolean)) {
        input.addEventListener('input', () => {
          if (source.decisions.has(location)) invalidateDecision();
        });
      }
      button(actions, '整理本頁補註', () => {
        try {
          if (typeof marketing.summarizeMarketingPage !== 'function') throw Error('本頁整理程式尚未載入，請重新整理。');
          manual = editor.value.trim();
          if (!manual) throw Error('請填寫對照原頁的補註。');
          result = marketing.summarizeMarketingPage(manual);
          paintItems();
          invalidateDecision();
          status('已整理補註，核對後仍需按採用。', false, info);
        } catch (error) { status(error.message, true, info); }
      });
      button(actions, '核對並採用本頁', () => {
        try {
          periodIsValid(source);
          if (editor.value.trim() !== manual) throw Error('補註已變更，請先按「整理本頁補註」。');
          if (page.readState !== 'read' && !manual) {
            throw Error('請對照有圖片的原頁補註並整理，確定字形、價格及條件。');
          }
          if (page.imageReview && !manual && !imageConfirmed?.checked) throw Error('請勾選已對照原圖。');
          if (!result.facts?.length) throw Error('未辨識到可採用事實。請依原頁補註商品、條件或門市事項等欄位。');
          const facts = result.facts.map(item => evidenceEntry(source, suggestionText(item), location));
          const recommendations = (result.suggestions || []).map(item => evidenceEntry(source, suggestionText(item), location));
          setDecision({label: '已採用', facts, recommendations, manual, imageConfirmed: imageConfirmed?.checked, manualSummary: manual ? result : null});
          status('本頁重點已採用，保留檔名及頁碼。', false, info);
        } catch (error) { status(error.message, true, info); }
      });
      button(actions, '本頁與本月無關', () => {
        try {
          periodIsValid(source);
          if (page.readState !== 'read' && (!manual || editor.value.trim() !== manual)) throw Error('請先辨識或補註以確認此頁內容。');
          setDecision({label: '人工核對後排除', facts: [], recommendations: [], manual, manualSummary: manual ? result : null});
          status('此頁已記錄為本次不採用。', false, info);
        } catch (error) { status(error.message, true, info); }
      });
    }
  }
  draw();
}

function render() {
  const inventory = $('inventory');
  inventory.replaceChildren();
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls.clear();
  $('marketingCoverageCheck').hidden = !chapterSources(MARKETING).some(source => source.marketing);
  for (const [name] of [...CHAPTERS, [SUPPLEMENT]]) {
    const files = chapterSources(name);
    if (!files.length) continue;
    const details = element(inventory, 'details', '', 'source-panel');
    const previewSummary = element(details, 'summary', name + ' · ' + files.length + ' 份來源');
    previewSummary.setAttribute('aria-label', previewSummary.textContent);
    if (name === MARKETING) details.open = true;
    for (const source of files) {
      const card = element(details, 'div', '', 'source-card');
      element(card, 'h3', source.name);
      const paint = sourceDetails(source, card);
      if (name === MARKETING) renderMarketing(card, source, paint);
      else renderReportReview(card, source, paint);
    }
  }
  if (template) $('templateStatus').textContent = '已核對原始範本 · ' + template.name + ' · ' + template.slides + ' 頁';
  else $('templateStatus').textContent = sourceStates.get(TEMPLATE) || '尚未選檔 · 真正輸出時才需要原始 PPTX 範本。';
  renderMapping();
  updateControls();
}

function selectedFiles(input) {
  return Array.from(input.files).map(file => ({file, slot: input.id, category: input.dataset.category}));
}

async function readFiles() {
  if (busy) return;
  const selected = fileInputs().flatMap(selectedFiles);
  if (!selected.length) {
    status('請先選檔。', true);
    return;
  }
  const unread = selected.filter(({slot}) => slot === TEMPLATE ? !template : !parsed.has(slot));
  // With no new files, the same button deliberately rechecks the selection.
  const target = unread.length ? unread : selected;
  if (selected.length > 45 || selected.reduce((size, {file}) => size + file.size, 0) > 250 * 1024 * 1024) {
    status('每次最多 45 份檔案、合計 250 MiB。請合併逐頁圖片或分批核對。', true);
    return;
  }
  let password = $('goodSpeedPassword').value;
  $('goodSpeedPassword').value = '';
  const retryGoodSpeed = password ? selected.filter(({category}) => category?.startsWith('好速')) : [];
  const reads = Array.from(new Set([...target, ...retryGoodSpeed]));
  const ticket = ++generation;
  busy = true;
  updateControls();
  status('正在驗證督導登入…');
  try {
    await verify();
    if (ticket !== generation) return;
    const updates = new Map();
    for (const {file, slot, category} of reads) {
      status('正在本機讀取 ' + file.name + '…');
      try {
        validateFile(file);
        const bytes = await file.arrayBuffer();
        if (ticket !== generation) return;
        access.requireCurrent();
        const result = await job(slot === TEMPLATE ? 'template' : 'source', {
          bytes, name: file.name, category, password: category?.startsWith('好速') ? password : ''
        }, [bytes]);
        if (ticket !== generation) return;
        access.requireCurrent();
        if (slot === TEMPLATE) template = {...result, name: file.name, file};
        else {
          if (!updates.has(slot)) updates.set(slot, []);
          updates.get(slot).push({...result, slot, category, file: result.kind === 'image' ? file : null});
        }
      } catch (error) {
        if (ticket !== generation || error.name === 'AbortError') return;
        if (slot === TEMPLATE) {
          template = null;
          sourceStates.set(slot, '讀取失敗 · ' + error.message);
        } else {
          if (!updates.has(slot)) updates.set(slot, []);
          updates.get(slot).push({name: file.name, slot, category, error: error.message});
        }
      }
    }
    for (const [slot, sources] of updates) parsed.set(slot, sources);
    if (updates.has('marketingSource')) $('marketingComplete').checked = false;
    if (updates.size) $('highlights').value = '';
    resetConfirmation();
    const failed = sourceList().filter(source => source.error).length + Number(!template && sourceStates.get(TEMPLATE)?.startsWith('讀取失敗') === true);
    const suffix = template ? '請核對下方來源。' : '要下載簡報，請另選原始作戰範本。';
    status('已完成本機讀取。' + (failed ? failed + ' 份讀取失敗，請查看各檔提示。' : '') + suffix, failed > 0);
  } catch (error) {
    if (ticket === generation) status(error.message, true);
  } finally {
    password = '';
    if (ticket === generation) {
      busy = false;
      render();
    }
  }
}

function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 30000);
}

async function exportReport(audit) {
  if (busy) return;
  const ticket = generation;
  const feedback = $('exportStatus');
  try {
    access.requireCurrent();
    if (!audit && !$('acknowledge').checked) throw Error('請先核對可用內容與缺口。');
    const meta = metadata();
    busy = true;
    updateControls();
    status('正在驗證及整理匯出內容…', false, feedback);
    await verify();
    if (ticket !== generation) return;
    const filename = '作戰會議_' + meta.periods.meeting;
    if (audit) {
      access.requireCurrent();
      downloadFile(new Blob([JSON.stringify(meta, null, 2)], {type: 'application/json'}), filename + '_來源核對.json');
    } else {
      // Supply the selected template again so worker restarts after a failed
      // source never invalidate a separately inspected template.
      const input = await template.file.arrayBuffer();
      if (ticket !== generation) return;
      access.requireCurrent();
      await job('template', {bytes: input}, [input]);
      if (ticket !== generation) return;
      const bytes = await job('export', {meta});
      if (ticket !== generation) return;
      await access.verify();
      if (ticket !== generation) return;
      access.requireCurrent();
      const ready = meta.status === 'READY_VERIFIED';
      downloadFile(new Blob([bytes], {type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'}),
        filename + (ready ? '_已核對.pptx' : '_待核草稿.pptx'));
    }
    status('已交給瀏覽器下載。', false, feedback);
  } catch (error) {
    if (ticket === generation) status(error.message, true, feedback);
  } finally {
    if (ticket === generation) {
      busy = false;
      updateControls();
    }
  }
}

$('authForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('verify').disabled = true;
  const key = $('passcode').value;
  $('passcode').value = '';
  $('authStatus').textContent = '正在驗證督導通行碼…';
  try { await verify(key); }
  catch (error) { $('authStatus').textContent = error.message; }
  finally { $('verify').disabled = false; }
});
$('readFiles').addEventListener('click', readFiles);
$('clear').addEventListener('click', () => clearData());
$('download').addEventListener('click', () => exportReport(false));
$('audit').addEventListener('click', () => exportReport(true));
$('acknowledge').addEventListener('change', updateControls);
$('marketingComplete').addEventListener('change', refresh);
$('highlights').addEventListener('input', refresh);
$('meeting').addEventListener('input', () => {
  for (const source of sourceList()) {
    source.review = null;
    source.entries = [];
    source.decisions?.clear();
  }
  $('marketingComplete').checked = false;
  $('highlights').value = '';
  resetConfirmation();
  render();
  status('會議月份已變更，請重新核對各來源期間及內容。');
});

for (const input of fileInputs()) {
  input.addEventListener('change', () => {
    generation++;
    stopWorker();
    busy = false;
    if (input.id === TEMPLATE) {
      template = null;
      sourceStates.set(TEMPLATE, input.files.length ? '已選檔，等待讀取' : '尚未選檔');
    } else {
      parsed.delete(input.id);
      $('highlights').value = '';
      if (input.id === 'marketingSource') $('marketingComplete').checked = false;
    }
    resetConfirmation();
    render();
    status(input.files.length ? '已更新選檔，請按「讀取選取的檔案」。' : '此來源及其核對結果已清除。');
  });
}

$('meeting').value = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit'
}).format(new Date());
render();
verify().catch(() => {}).finally(() => {
  $('passcode').disabled = false;
  $('verify').disabled = false;
});
