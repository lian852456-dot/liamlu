// Independent relay settlements; no department monthly Final or employee-ID inference.
const NORTH12B_GOLD_DAILY_FILE = 'north12b-gold-daily-private-latest.json';

function north12bGoldDailyLedger_() {
  const files = departmentOpsFolder_().getFilesByName(NORTH12B_GOLD_DAILY_FILE);
  let latest = null;
  while (files.hasNext()) {
    const file = files.next();
    if (!latest || file.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) latest = file;
  }
  if (!latest) throw new Error('北一二B 日結尚未同步');
  return North12BGoldDaily.validate(JSON.parse(latest.getBlob().getDataAsString('UTF-8')));
}

function north12bGoldDailyRead(payload) {
  ptRequireSession_((payload || {}).token, 'north12b_gold_read');
  return {ledger:north12bGoldDailyLedger_()};
}
