// Local inspection only. Company field mappings deliberately remain unconfirmed.
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
  ['好速長約', '公司當期定義', '長約合約月數定義、明細及占比分母，尚未設定門檻'],
  ['好速失敗原因', '回報日期＋原文出處', '好速可識別原文、店／個人層級與去重識別；無紀錄不等於0失敗']
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
export function validatePeriods(p) {
  const month=/^20\d{2}-(0[1-9]|1[0-2])$/, day=/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
  if(!month.test(p.meeting||'')||!day.test(p.sourceDate||'')) throw Error('請填會議月份及來源資料截止日，兩者不會互相代填。');
  const d=new Date(p.sourceDate+'T00:00:00Z');
  if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==p.sourceDate)throw Error('來源截止日無效。');
  for(const k of ['storeMonth','goldEnd'])if(p[k]&&!month.test(p[k]))throw Error('月份格式不正確。');
  return {...p, policy:cleanText(p.policy,80)};
}
export function draftMetadata(form, sources, template) {
  const periods=validatePeriods(form);
  if(!sources?.length||!template)throw Error('請先讀取來源檔及原始範本。');
  return {contract:'operations-local-draft-v1', status:'DRAFT_UNMAPPED',
    periods, highlights:cleanText(form.highlights), failures:cleanText(form.failures,400),
    sourceFiles:sources.map(s=>({name:s.name,bytes:s.bytes,sha256:s.sha256,kind:s.kind,inspection:s.inspection,category:s.category,sourcePeriod:cleanText(s.sourcePeriod,100),coverage:s.coverage})),
    templateHash:template.sha256, templateSlides:15, outputSlides:16,
    unresolved:SECTIONS.map(s=>s[0]+(s[0]==='舊換新'&&sources.some(v=>v.tradein)?'：四區明細已對帳；來源年份及政策仍待確認':'：來源欄位與計算口徑尚未對映')),
    tradein:sources.find(s=>s.tradein)?.tradein||null,
    caution:(sources.some(s=>s.tradein)?'第6頁依已對帳舊換新資料重建；其餘範本原值及圖片未更新。':'範本原值及圖片未更新；僅會議月份與人工重點已填入。')+'好速數值、長約與原因統計待公司來源。'};
}
