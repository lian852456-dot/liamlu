// Isolated source adapter for department_ops_read / department-version-read/v1.
// Callbacks MUST run within the existing protected source service; no browser
// token, caller-selected employee ID, source URL or real database path is used.
import {need, fingerprint, validId} from '../contract.mjs';
export function createMonthlyDashboardSource({db, readProtectedMonthly, readExternalSpending, verifyOwner, now=Date.now}) {
 need(db && [readProtectedMonthly,readExternalSpending,verifyOwner].every(f=>typeof f==='function'), 'MONTHLY_CONNECTORS_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS city_month_source_versions(employee_id TEXT NOT NULL,month TEXT NOT NULL,source_key TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(employee_id,month,source_key));`);
 const issued=new WeakMap();
 async function checkOwner(actor) {
  const p=await verifyOwner(actor);
  need(p?.source==='B_LOCKED_SESSION'&&p.active===true&&p.employeeId===actor.employeeId&&p.uid===actor.uid&&p.expiresAt>now()&&
   (p.sessionEpoch||null)===(actor.sessionEpoch||null),'MONTHLY_OWNER_REQUIRED',401);
 }
 async function read(actor) {
  need(validId(actor?.employeeId)&&validId(actor?.uid),'MONTHLY_OWNER_REQUIRED',401);await checkOwner(actor);
  const month=new Date(now()+8*3600000).toISOString().slice(0,7);
  // Full-source call deliberately omits knownVersion: spending can change alone.
  const raw=await readProtectedMonthly(actor, {});
  need(raw?.readContract==='department-version-read/v1'&&raw.notModified!==true&&typeof raw.readVersion==='string'&&raw.readVersion&&
   typeof raw.monthly?.revision==='string'&&raw.monthly.revision&&raw.gold?.type==='north12-monthly-v2'&&Array.isArray(raw.gold.months), 'FULL_MONTHLY_SOURCE_REQUIRED');
  const months=raw.gold.months.filter(m=>m.monthKey===month);need(months.length===1,'CURRENT_MONTH_NOT_UNIQUE');
  const m=months[0];need(m.legacy!==true&&m.schema==='north12-department-gold-month/v2'&&typeof m.versionId==='string'&&m.versionId&&
   /^[a-f0-9]{64}$/.test(m.sourceHash)&&/^\d{4}-\d{2}-\d{2}$/.test(m.dateRange?.cutoff)&&m.dateRange.cutoff.slice(0,7)===month&&Array.isArray(m.records),'MONTHLY_SOURCE_INVALID');
  const rows=m.records.filter(r=>r.employeeId===actor.employeeId);need(rows.length===1,'MONTHLY_EMPLOYEE_NOT_UNIQUE');
  const row=rows[0];need(Number.isSafeInteger(row.medal)&&row.region==='北一二B','MONTHLY_MEDAL_INVALID');
  const spending=await readExternalSpending(actor,month);
  // Missing prior spending is unknown, never an implicit zero. This source must
  // exclude the exchange ledger below, or the same debit would count twice.
  need(spending?.schema==='city-external-spending/v1'&&spending.employeeId===actor.employeeId&&spending.month===month&&
   spending.excludesLedger==='city-gold-exchange/v1'&&Number.isSafeInteger(spending.amount)&&spending.amount>=0&&
   typeof spending.version==='string'&&spending.version&&typeof spending.receipt==='string'&&spending.receipt,'EXTERNAL_SPENDING_REQUIRED');
  const latest=await readProtectedMonthly(actor,{});
  need(latest?.readVersion===raw.readVersion&&latest.monthly?.revision===raw.monthly.revision,'MONTHLY_SOURCE_CHANGED');
  const latestSpending=await readExternalSpending(actor,month);
  need(fingerprint(latestSpending)===fingerprint(spending),'EXTERNAL_SPENDING_CHANGED');await checkOwner(actor);
  const provenance={monthlyReadVersion:raw.readVersion,registryRevision:raw.monthly.revision,monthVersion:m.versionId,
   workbookHash:m.sourceHash,cutoff:m.dateRange.cutoff,externalSpendingVersion:spending.version,externalSpendingReceipt:spending.receipt};
  const key=fingerprint([provenance,row.employeeId,row.medal,spending.amount]);
  db.exec('BEGIN IMMEDIATE');let revision;
  try {
   const max=db.prepare('SELECT COALESCE(MAX(revision),0) n FROM city_month_source_versions WHERE employee_id=? AND month=?').get(actor.employeeId,month).n;
   const old=db.prepare('SELECT revision FROM city_month_source_versions WHERE employee_id=? AND month=? AND source_key=?').get(actor.employeeId,month,key);
   need(!old||old.revision===max,'MONTHLY_SOURCE_REPLAY');revision=old?.revision||max+1;
   if(!old)db.prepare('INSERT INTO city_month_source_versions VALUES(?,?,?,?)').run(actor.employeeId,month,key,revision);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const value={schema:'employee-month-gold/v1',basis:'dashboard-month-net',employeeId:actor.employeeId,month,sourceNet:row.medal,
   externalSpent:spending.amount,revision,sourceId:'department-ops-monthly',hash:key,provenance};
  issued.set(value,fingerprint(value));return value;
 }
 return {read,verify:async value=>{need(issued.get(value)===fingerprint(value),'UNATTESTED_MONTHLY_SNAPSHOT');return value;}};
}

// An explicit new display field keeps the original monthly figure/history intact.
// Both views must use the same authority.balance result, not separate balances.
export function projectMonthlyRow(row,balance) {
 need(row?.employeeId===balance?.employeeId&&balance.amountBasis==='dashboard-month-net'&&row.medal===balance.sourceNet,'DASHBOARD_BALANCE_SOURCE_MISMATCH');
 return {...row,sourceMedal:row.medal,availableMedal:balance.available,citySpent:balance.citySpent,externalSpent:balance.externalSpent,
  goldDeficit:balance.deficit,goldReadVersion:balance.readVersion};
}
