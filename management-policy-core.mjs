export const CONTRACT = 'management-policy-draft-v1';
const field = (value, max, label, required = true) => {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw Error(`請填寫有效的${label}（最多 ${max} 字）。`);
  return value.trim();
};
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// Accept only document fields. Never serialize the application, auth object,
// storage, uploaded workbooks, arbitrary JSON keys, or source file paths.
export function normalizePolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('草稿格式不符。');
  if (input.contract !== undefined && input.contract !== CONTRACT) throw Error('不支援此草稿版本。');
  const result = {
    contract: CONTRACT,
    title: field(input.title, 100, '辦法名稱'),
    month: field(input.month, 7, '適用月份'),
    version: field(input.version, 60, '版本名稱'),
    start: field(input.start, 10, '開始日期'),
    end: field(input.end, 10, '結束日期'),
    audience: field(input.audience, 160, '適用對象'),
    source: field(input.source, 1200, '來源與核對說明'),
    reviewed: input.reviewed === true,
    sections: []
  };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result.month) || !date(result.start) || !date(result.end) || result.start > result.end || !result.start.startsWith(result.month) || !result.end.startsWith(result.month)) throw Error('適用月份與起訖日期須一致，結束日期不可早於開始日期。');
  if (!Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > 12) throw Error('請提供 1～12 個辦法章節。');
  result.sections = input.sections.map(section => ({title:field(section?.title, 100, '章節名稱'), body:field(section?.body, 6000, '章節內容')}));
  assertShareable(result);
  return result;
}

export function assertShareable(policy) {
  const value = [policy.title, policy.version, policy.audience, policy.source, ...policy.sections.flatMap(s => [s.title, s.body])].join('\n');
  // A conservative check for accidental credential/contact/ID pastes. Manual
  // review remains required; this is not a claim to detect all personal data.
  if (/\b(?:PT_KEY|access_token|refresh_token|authorization|api[_-]?key|password|passcode|token)\s*[=:：]\s*\S+/i.test(value)
      || /(?:密碼|通行碼|員工編號|員編|姓名)\s*[=:：]\s*\S+/.test(value)
      || /\b[A-Z][12]\d{8}\b/i.test(value)
      || /(?:\+?886[-\s]?)?09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/.test(value)
      || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value)) throw Error('內容疑似包含登入資料、個人識別或聯絡資訊，請先移除後再產出。');
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// This is the only executable content in the portable reader. CSP permits its
// exact hash; policy text is escaped and never interpolated into JavaScript.
export const MONTH_FILTER_SCRIPT = `(()=>{const input=document.getElementById('policyMonth'),empty=document.getElementById('policyEmpty'),docs=Array.from(document.querySelectorAll('[data-policy-month]'));function show(){const month=input.value;let found=false;for(const doc of docs){const match=doc.dataset.policyMonth===month;doc.hidden=!match;found=found||match;}empty.hidden=found;empty.textContent=found?'':month?month+' 尚未提供管理辦法資料，請選擇已提供月份。':'請選擇查看月份。';}input.addEventListener('input',show);input.addEventListener('change',show);show();})();`;
export const MONTH_FILTER_HASH = '4zrlcBf3lTgYSnrBOnEB4AIv+EQ7jWW7UqpY6BYA0Ug=';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function policyDocument(p, selected) {
  const status = p.reviewed ? '內容已核對' : '待核草稿';
  const content = p.sections.map((section, i) => `<section><p class="number">${String(i + 1).padStart(2, '0')}</p><h2>${escape(section.title)}</h2><div class="body">${escape(section.body)}</div></section>`).join('\n');
  return `<article data-policy-month="${p.month}"${p.month===selected?'':' hidden'}><header><p class="eyebrow">北一二B · 管理辦法</p><span class="status">${status} · 門市唯讀版</span><h1>${escape(p.title)}</h1><div class="meta"><span>適用月份 ${escape(p.month)}</span><span>版本 ${escape(p.version)}</span><span>期間 ${escape(p.start)} ～ ${escape(p.end)}</span><span>對象 ${escape(p.audience)}</span></div></header>
${p.reviewed ? '' : '<aside class="draft"><strong>待核草稿</strong>：來源或版本尚待確認，請勿作為正式執行依據。</aside>'}
${content}<details open><summary>來源與版本說明</summary><p class="source">${escape(p.source)}</p></details></article>`;
}

export function renderPolicyHTML(input) {return renderPolicyCollectionHTML([input]);}

export function renderPolicyCollectionHTML(inputs, selectedMonth) {
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>24)throw Error('請提供 1～24 個月份的管理辦法。');
  const policies=inputs.map(normalizePolicy).sort((a,b)=>b.month.localeCompare(a.month));
  if(new Set(policies.map(p=>p.month)).size!==policies.length)throw Error('同一月份只能有一個已選定版本，請先核對版本。');
  const selected=selectedMonth===undefined?policies[0].month:field(selectedMonth,7,'查看月份');
  if(!MONTH.test(selected))throw Error('查看月份格式不符。');
  const documents=policies.map(p=>policyDocument(p,selected)).join('\n');
  const title=policies.length===1?policies[0].title+'｜'+policies[0].month+'｜'+(policies[0].reviewed?'內容已核對':'待核草稿'):'北一二B 管理辦法・月份查詢';
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${MONTH_FILTER_HASH}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'"><title>${escape(title)}</title><style>
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#f5f6f8;color:#24272c;font:15px/1.8 'PingFang TC','Microsoft JhengHei',system-ui,sans-serif}main{max-width:900px;margin:auto;padding:32px 24px}header{background:#fff2e5;border:1px solid #efddcc;border-radius:12px;padding:28px}.eyebrow,.number{color:#a34b1c;font-size:12px;font-weight:700;letter-spacing:.08em;margin:0 0 10px}h1{font-size:30px;line-height:1.45;margin:0 0 16px;overflow-wrap:anywhere}h2{font-size:20px;line-height:1.5;margin:0 0 12px}.meta{display:flex;flex-wrap:wrap;gap:10px 22px;color:#5e5f62;font-size:13px}.status{display:inline-block;background:white;color:#9c481b;border:1px solid #dfba9d;border-radius:5px;padding:2px 10px;font-size:12px;margin-bottom:12px}.draft{background:#fff8e9;border:1px solid #ead8ab;border-radius:8px;padding:14px 18px;margin-top:20px;font-size:14px}section{background:white;border:1px solid #e1e4e8;border-radius:10px;margin-top:20px;padding:24px}.body{white-space:pre-wrap;overflow-wrap:anywhere}details{border-top:1px solid #ddd;padding-top:16px;margin-top:24px;font-size:13px;color:#60656b}summary{cursor:pointer;font-weight:600}footer{font-size:12px;color:#6b7179;margin-top:24px}.source{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:500px){main{padding:20px 14px}header,section{padding:20px}h1{font-size:25px}}@media print{body{background:white}main{max-width:none;padding:0}header,section{break-inside:avoid}details{display:block}details .source{display:block}footer{color:#444}}
[hidden]{display:none!important}.month-filter{background:white;border:1px solid #e1e4e8;border-radius:10px;padding:18px 22px;margin-bottom:20px}.month-filter label{font-weight:600;display:block;margin-bottom:7px}.month-filter input{font:inherit;width:210px;max-width:100%;padding:8px 12px;border:1px solid #d5d9df;border-radius:6px;background:white;color:#24272c}.month-filter p{font-size:12px;color:#60656b;margin:8px 0 0}#policyEmpty{background:white;border:1px solid #e1e4e8;border-radius:10px;padding:24px}@media print{.month-filter{display:none}}
</style></head><body><main><nav class="month-filter" aria-label="篩選月份"><label for="policyMonth">查看月份</label><input id="policyMonth" type="month" value="${selected}" aria-controls="policyDocuments"><p>已提供月份：${policies.map(p=>p.month).join('、')}。未提供的月份不沿用其他月份資料。</p><noscript>月份篩選需啟用 JavaScript；目前僅顯示預選月份。</noscript></nav><div id="policyDocuments">${documents}</div><p id="policyEmpty" role="status"${policies.some(p=>p.month===selected)?' hidden':''}>${policies.some(p=>p.month===selected)?'':escape(selected)+' 尚未提供管理辦法資料，請選擇已提供月份。'}</p><footer>本文件僅適用於各版標示期間。可離線閱讀與使用瀏覽器列印；未包含編輯工具、登入資料或每週 Excel。內容以經核對版本為準。</footer></main><script>${MONTH_FILTER_SCRIPT}</script></body></html>`;
}
export function policyFilename(input, extension = 'html') {
  const p = normalizePolicy(input);
  return `北一二B_管理辦法_${p.month}_${p.reviewed ? '已核對' : '待核草稿'}.${extension === 'json' ? 'json' : 'html'}`;
}
