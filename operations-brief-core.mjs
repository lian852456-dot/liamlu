// Local-only sources; unsupported mappings remain explicitly pending.
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const TEMPLATE_HASH = 'fbbc86defd4de6d6739657df7ae1e76c50795c4cb0c15809174c063ab7daf803';
// Only recognized labels may leave the parser. Never return customer/source rows.
export const HEADER_LABEL = /^(?:日期|資料日期|截止日|月份|期別|區域|區碼|部區|督導區|店點|店名|門市|門市名稱|門市代碼|店代碼|員編|員工編號|姓名|員工姓名|門號|客戶姓名|合約月數|合約期間|實績|目標|實績點數|目標點數|達成率|長約|長約件數|長約占比|失敗原因|失敗原文|原因|商品|商品名稱|好速|企客4G|降轉|Device|回收數|保險件數|銷售數|扣分|成績|原G)$/i;
export const SECTIONS = Object.freeze([
  ['店務', '結算月＋近半年', '各店原G分數、扣分、原因與月份；沿用公司原單位'],
  ['舊換新', '績效起訖＋政策版本', '當期回收／Device實績與目標、各店明細、當期政策'],
  ['新復原者／保險', '績效截止＋政策版本', '手機及穿戴保險件數、銷售分母、比較期與政策原文'],
  ['金牌', '近三個月', '每月正式淨金牌、區／店／識別欄；與每日D27流程分開'],
  ['好速', '公司KPI截止', '正式實績點數、目標點數及降轉標記；企客4G納入，勿套用VK口徑'],
  ['好速長約', '來源截止＋每日規則版本', '沿用每日36M認列；BB店點12／24／36M合計為占比分母，不額外重加0.5點'],
  ['好速失敗原因', '來源截止＋標準分類出處', '只彙總當月BB明細標準分類；本機訂單去重，V旗標另列；不匯出個資或自由備註']
]);

export function validateFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw Error('檔案是空的，請重新選取。');
  if (file.size > MAX_FILE_BYTES) throw Error('單檔上限50 MiB；35MB可處理。請分檔或另存精簡版後再試。');
  return true;
}
export function detectKind(bytes) {
  const b = new Uint8Array(bytes);
  if (b[0]===0x50 && b[1]===0x4b && b[2]===3 && b[3]===4) return 'zip';
  if ([0xd0,0xcf,0x11,0xe0].every((v,i)=>b[i]===v)) return 'ole';
  if (new TextDecoder().decode(b.slice(0,5))==='%PDF-') return 'pdf';
  if (b.slice(0,Math.min(b.length,4096)).some(v=>v===0)) return 'binary';
  return 'text';
}
export function cleanText(value, limit=600) {
  const s=String(value??'').trim();
  if(s.length>limit) throw Error('文字超出'+limit+'字，請分段縮短後再產生。');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw Error('文字含不支援的控制字元。');
  return s;
}
export function validatePeriods(p,{requireSourceDate=true}={}) {
  const month=/^20\d{2}-(0[1-9]|1[0-2])$/, day=/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
  if(!month.test(p.meeting||'')) throw Error('請填有效的會議月份。');
  if (requireSourceDate && !p.sourceDate) throw Error('請填來源資料截止日。');
  if (p.sourceDate) {
    const date = new Date(p.sourceDate+'T00:00:00Z');
    if(!day.test(p.sourceDate)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==p.sourceDate)throw Error('來源截止日無效。');
  }
  for(const k of ['storeMonth','goldEnd'])if(p[k]&&!month.test(p[k]))throw Error('月份格式不正確。');
  const {meeting,sourceDate,storeMonth,goldEnd} = p;
  return {meeting,...(sourceDate ? {sourceDate} : {}),...(storeMonth ? {storeMonth} : {}),...(goldEnd ? {goldEnd} : {}),policy:cleanText(p.policy,80)};
}
export const REPORT_SECTIONS = Object.freeze([
  ...SECTIONS.map(([name, , needs]) => ({name, needs})),
  {name:'行銷簡報',needs:'本月行銷版次、適用範圍、逐頁來源及核對結果'}
]);
const VERIFIED = 'verified';
const MISSING_VALUE = /^(?:待核|待提供|待補|未確認|未辨識|不明|未知|無資料|N\/A)$/i;
const SOURCE_KEY = /^[a-f0-9]{64}$/;
const available = value => Boolean(value && !MISSING_VALUE.test(value));
const BOUNDED_STATUS = new Set(['selected','read','partial','error','missing',VERIFIED]);
const REQUIRED_TOPICS = {
  '店務':{storeDeficiencies:'當月未滿分門市與缺失'},
  '舊換新':{tradeinPolicy:'當期舊換新政策'},
  '新復原者／保險':{insurancePolicy:'當期復原者政策',insurancePerformance:'本期／比較期搭售實績',insuranceComparison:'當期方案比較'}
};
const PAGE_TOPICS = new Set(Object.values(REQUIRED_TOPICS).flatMap(topics => Object.keys(topics)));

function sourceLocators(source) {
  return new Set([
    ...(source.reviewableLocators || []),
    ...(source.sheets || []).flatMap(sheet => [sheet.name, sheet.range && sheet.name+'!'+sheet.range]),
    ...(source.report?.sections || []).flatMap(section => (section.evidence || []).flatMap(item => [item.sheet,item.locator])),
    ...(source.marketing?.pages || []).flatMap(page => [page.pageLabel, page.page && '第'+page.page+'頁'])
  ].filter(entry => typeof entry === 'string' && entry.trim()).map(entry => entry.trim()));
}
const CURRENT_CUTOFF = new Set(['舊換新','新復原者／保險','好速','好速長約','好速失敗原因']);
function periodMonths(value) {
  return Array.from(String(value||'').matchAll(/(20\d{2})\s*[-./年]\s*(0?[1-9]|1[0-2])(?!\d)/g),
    match=>match[1]+'-'+match[2].padStart(2,'0'));
}
function sourceCutoff(source) {
  const section = source.report?.sections?.find(item=>item.key===source.category);
  return section?.cutoff || source.tradein?.cutoff || source.goodspeed?.cutoff || '';
}
function sectionReview(name, review, sources, meeting) {
  const state = BOUNDED_STATUS.has(review?.status) ? review.status : 'missing';
  const period = cleanText(review?.period,6000);
  const coverage = cleanText(review?.coverage,600);
  const problems = [];
  function normalizedRef(item) {
    const locator = cleanText(item?.locator,240);
    const source = (sources.get(item?.sourceSha256) || []).find(file=>
      file.category === name && (!item.sourceName || item.sourceName === file.name) && file.locators.includes(locator) && file.status !== 'error' && !file.needsPassword);
    if (!source || !locator) {
      problems.push('有來源檔或頁碼／工作表無法對帳，請重新核對。');
      return null;
    }
    const knownMonth = periodMonths(source.cutoff).at(-1);
    const markedMonths = periodMonths(source.sourcePeriod).sort();
    if (!available(source.sourcePeriod) || !available(source.coverage)) {
      problems.push('有來源尚未填寫實際期間或涵蓋範圍。');
      return null;
    }
    const contemporaneous = name === '行銷簡報' || CURRENT_CUTOFF.has(name);
    const coversMonth = markedMonths.length && meeting >= markedMonths[0] && meeting <= markedMonths.at(-1);
    const isPolicy = ['tradeinPolicy','insurancePolicy','insuranceComparison'].includes(item.topic);
    if ((knownMonth && knownMonth > meeting)
      || (knownMonth && CURRENT_CUTOFF.has(name) && !isPolicy && knownMonth !== meeting)
      || (contemporaneous && !coversMonth)) {
      problems.push('有來源期間與本月會議或該章節口徑不符。請確認實際期間及年份。');
      return null;
    }
    return {
      sourceSha256:item.sourceSha256, sourceName:source.name, sourcePeriod:source.sourcePeriod, sourceCoverage:source.coverage,
      locator, ...(PAGE_TOPICS.has(item.topic) ? {topic:item.topic} : {})
    };
  }
  function normalizedText(items) {
    if (!Array.isArray(items) || items.length > 500) throw Error('章節核定重點上限為500項，請先分組整理。');
    return items.flatMap(item => {
      const value = cleanText(item?.text,420);
      if (!value) return [];
      const ref = normalizedRef(item);
      return ref ? [{...ref,text:value}] : [];
    });
  }
  function normalizedTables(items) {
    if (!Array.isArray(items) || items.length > 40) throw Error('單章節可編輯表格上限為40份，請先彙整。');
    return items.flatMap(item => {
      const ref = normalizedRef(item);
      if (!ref) return [];
      const locationList = Array.isArray(item.additionalLocators) ? item.additionalLocators : [];
      const locators = [ref.locator];
      for (const locator of locationList.slice(0,30)) {
        const more = normalizedRef({...item,locator});
        if (more && !locators.includes(more.locator)) locators.push(more.locator);
      }
      const headers = item.headers?.map(header => cleanText(header,42));
      if (!headers?.length || headers.length > 10 || !headers.every(Boolean) || !Array.isArray(item.rows) || item.rows.length > 500 || !item.rows.length) {
        problems.push('有待核表格缺少欄名、資料或超過輸出上限。');
        return [];
      }
      const rows = item.rows.map(row => {
        if (!Array.isArray(row) || row.length !== headers.length) throw Error('表格資料欄位數不一致，請重新核對來源。');
        return row.map(cell => cleanText(cell,180) || null);
      });
      return [{...ref,locators,headers,rows}];
    });
  }
  if (state !== VERIFIED && state !== 'partial') return {status:state,period,coverage,facts:[],recommendations:[],tables:[],issues:[]};
  const facts = normalizedText(review.facts || []);
  const recommendations = normalizedText(review.recommendations || []);
  const tables = normalizedTables(review.tables || []);
  if (!available(period) || !available(coverage)) problems.push('請確認本章節來源期間與涵蓋範圍。');
  const content = [...facts,...tables];
  if (!content.length) problems.push('缺少已核對的事實或資料表。');
  for (const [topic,label] of Object.entries(REQUIRED_TOPICS[name] || {})) {
    if (!content.some(item => item.topic === topic)) problems.push('待核對'+label+'。');
  }
  if (['店務','舊換新'].includes(name) && !content.some(item => !item.topic)) problems.push('待核對本期數據表與彙總。');
  return {
    status:state === VERIFIED && !problems.length ? VERIFIED : 'partial',
    period, coverage,
    facts:available(period)&&available(coverage) ? facts : [],
    recommendations:available(period)&&available(coverage) ? recommendations : [],
    tables:available(period)&&available(coverage) ? tables : [],
    issues:[...new Set(problems)]
  };
}
export function draftMetadata(form, sources, template) {
  const periods = validatePeriods(form,{requireSourceDate:false});
  const sourceFiles = (sources || []).filter(s => SOURCE_KEY.test(s.sha256 || '')).map(s => ({
    name:cleanText(s.name,280), bytes:s.bytes, sha256:s.sha256, kind:s.kind,
    inspection:cleanText(s.inspection,1200), category:s.category,
    sourcePeriod:cleanText(s.sourcePeriod,160), coverage:cleanText(s.coverage,160),
    status:s.status, needsPassword:Boolean(s.needsPassword), cutoff:sourceCutoff(s), locators:[...sourceLocators(s)]
  }));
  const fileMap = new Map();
  for (const file of sourceFiles) {
    if (!fileMap.has(file.sha256)) fileMap.set(file.sha256,[]);
    fileMap.get(file.sha256).push(file);
  }
  const sections = Object.fromEntries(REPORT_SECTIONS.map(({name}) => [name,sectionReview(name,form.sections?.[name],fileMap,periods.meeting)]));
  const unresolved = REPORT_SECTIONS.filter(({name}) => sections[name].status !== VERIFIED).map(({name,needs}) =>
    name+'：'+(sections[name].issues.join('；') || needs));
  if (template?.sha256 !== TEMPLATE_HASH) unresolved.push('須核對原始15頁作戰範本。');
  const highlights = cleanText(form.highlights);
  if (!highlights) unresolved.push('須整理本月成果、問題、改善行動與追蹤事項。');
  return {
    contract:'operations-local-brief-v2', status:unresolved.length ? 'DRAFT_UNMAPPED' : 'READY_VERIFIED',
    periods, highlights, failures:cleanText(form.failures,400), sections, sourceFiles,
    templateHash:template?.sha256 || null, templateSlides:template?.slides || null, baseOutputSlides:template ? 16 : null, unresolved,
    caution:unresolved.length
      ? '缺口保留待核。原範本的歷史資料、活動政策及資料圖片已排除。'
      : '來源及會議重點已人工核對。原範本的歷史資料、活動政策及資料圖片已排除。'
  };
}
