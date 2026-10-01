// Generic private reminder transport. Policy text belongs only in the existing
// private data folder; never add a policy document or fixture to this repository.
const STORE_RULES_CONTRACT = 'store-rule-reminders-v1';
const STORE_RULES_FILE = 'north12-store-rule-reminders-private.json';

function storeRulesText_(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('規則提醒文字格式不正確');
  return value.trim();
}

function storeRulesDocument_(input) {
  if (!input || input.contract !== STORE_RULES_CONTRACT || input.scope !== 'store-daily-reminders') throw new Error('規則提醒資料契約不一致');
  if (!Array.isArray(input.rules) || !input.rules.length || input.rules.length > 50) throw new Error('規則提醒筆數不正確');
  const seen = {};
  const rules = input.rules.map(function(rule) {
    const id = storeRulesText_(rule && rule.id, 60);
    if (!/^[a-z0-9-]+$/.test(id) || seen[id]) throw new Error('規則提醒識別碼不正確');
    seen[id] = true;
    if (!Array.isArray(rule.exceptions) || rule.exceptions.length > 8 || !Array.isArray(rule.sources) || !rule.sources.length || rule.sources.length > 6) throw new Error('規則提醒來源或適用說明不完整');
    if (Object.keys(rule).some(function(key) { return ['id','category','title','instruction','frequency','audience','exceptions','sources'].indexOf(key) < 0; })) throw new Error('規則提醒含有非提醒欄位');
    return {
      id:id,
      category:storeRulesText_(rule.category, 40),
      title:storeRulesText_(rule.title, 120),
      instruction:storeRulesText_(rule.instruction, 1600),
      frequency:storeRulesText_(rule.frequency, 160),
      audience:storeRulesText_(rule.audience, 160),
      exceptions:rule.exceptions.map(function(item) { return storeRulesText_(item, 600); }),
      sources:rule.sources.map(function(source) {
        if (!source || !Array.isArray(source.pages) || !source.pages.length || source.pages.length > 10 || source.pages.some(function(page) { return !Number.isInteger(page) || page < 1 || page > 99; })) throw new Error('規則提醒來源頁碼不正確');
        return {shortName:storeRulesText_(source.shortName, 80), pages:source.pages.slice()};
      })
    };
  });
  return {
    contract:STORE_RULES_CONTRACT,
    scope:'store-daily-reminders',
    revision:storeRulesText_(input.revision, 80),
    context:storeRulesText_(input.context, 1200),
    rules:rules
  };
}

function storeRulesRead(payload) {
  // Authorization precedes even folder lookup or file enumeration.
  const claims = ptRequireSession_((payload || {}).token, 'department_store_rules_read');
  const folder = departmentOpsFolder_();
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('規則提醒儲存位置未通過私有檢查');
  const files = folder.getFilesByName(STORE_RULES_FILE);
  if (!files.hasNext()) return {available:false, contract:STORE_RULES_CONTRACT, expiresAt:Number(claims.exp)};
  const file = files.next();
  if (files.hasNext() || file.getSharingAccess() !== DriveApp.Access.PRIVATE || file.getSize() > 120000) throw new Error('規則提醒檔案未通過私有檢查');
  let document;
  try { document = storeRulesDocument_(JSON.parse(file.getBlob().getDataAsString('UTF-8'))); }
  catch (error) { throw new Error('規則提醒私有資料格式不正確'); }
  return {available:true, contract:STORE_RULES_CONTRACT, expiresAt:Number(claims.exp), document:document};
}
