// Isolated read connector for the existing CityGoldScopedRead response contract.
// This contract attests source NET medals, not gross earned history. It must not
// be silently promoted to the exchange ledger's employee-month-gold/v1 snapshot.
import {need, validId, fingerprint} from './contract.mjs';
const audience = 'north12b-city-formal-login';
const sameIdentity = (a, b) => ['employeeId', 'uid', 'worldId', 'sessionEpoch'].every(k => a[k] === b[k]);

export function createScopedGoldReader({validateOwner, readScoped, now = Date.now}) {
  need(typeof validateOwner === 'function' && typeof readScoped === 'function', 'SCOPED_READ_CONNECTORS_REQUIRED');
  async function owner(context) {
    const p = await validateOwner(context);
    need(p?.source === 'B_LOCKED_SESSION' && p.active === true && p.accountKind === 'employee' &&
      p.audience === audience && Number.isSafeInteger(p.expiresAt) && p.expiresAt > now() && validId(p.employeeId) && validId(p.uid) &&
      p.worldId === 'current-guests' && typeof p.sessionEpoch === 'string' && p.sessionEpoch.length > 0,
      'FORMAL_OWNER_REQUIRED', 401);
    return p;
  }
  return {
    async read(context, input) {
      need(input && Object.keys(input).length === 1 && /^20\d{2}-(0[1-9]|1[0-2])$/.test(input.period), 'READ_PERIOD_ONLY', 400);
      const who = await owner(context);
      // readScoped runs server-side against the deployed protected read action,
      // once one exists. Never forward a browser-selected employee ID or URL.
      const raw = await readScoped(context, {period: input.period});
      const s = raw?.source, b = raw?.balance;
      need(raw?.status === 'ok' && raw.schema === 'city-gold-source/v1' &&
        s?.verified === true && s.serverDerived === true && s.employeeId === who.employeeId &&
        s.period === input.period && typeof s.sourceVersion === 'string' && s.sourceVersion.length > 0 &&
        /^[a-f0-9]{64}$/.test(s.hash) && typeof s.receipt === 'string' && s.receipt.length > 0 &&
        Number.isFinite(Date.parse(s.asOf)) && typeof raw.readVersion === 'string' && raw.readVersion.length > 0,
        'SCOPED_SOURCE_INVALID');
      need(b && Number.isSafeInteger(s.cumulative) && b.sourceNet === s.cumulative &&
        Number.isSafeInteger(b.spent) && b.spent >= 0 && Number.isSafeInteger(b.refunds) &&
        b.refunds >= 0 && b.refunds <= b.spent && typeof b.status === 'string', 'SCOPED_BALANCE_INVALID');
      const available = b.sourceNet - b.spent + b.refunds;
      need(Number.isSafeInteger(available) && (b.status === 'active' ?
        available >= 0 && b.available === available : b.available === null), 'SCOPED_BALANCE_INVALID');
      const current = await owner(context);
      need(sameIdentity(who, current), 'FORMAL_OWNER_CHANGED', 401);
      return {
        schema: 'city-gold-read-assessment/v1', employeeId: who.employeeId, uid: who.uid,
        month: input.period, sourceNet: b.sourceNet, spent: b.spent, refunds: b.refunds,
        available: b.available, balanceStatus: b.status, sourceVersion: s.sourceVersion,
        sourceHash: s.hash, sourceReceipt: s.receipt, sourceCutoff: raw.sourceCutoff,
        // Both presentation consumers receive this exact projection and version.
        readVersion: fingerprint([raw.readVersion, who.employeeId, who.uid, who.sessionEpoch]),
        grossAcquired: null, grossHistoryVerified: false,
        exchangeEnabled: false, exchangeBlock: 'GROSS_EARNINGS_AND_EXTERNAL_SPEND_ATTESTATION_REQUIRED'
      };
    },
    async exchangeSnapshot(context, input) {
      await this.read(context, input);
      need(false, 'NET_SOURCE_IS_NOT_EXCHANGE_ENTITLEMENT', 503);
    }
  };
}
