/**
 * Pure contracts for the isolated city-v4 prototype.
 *
 * This module does not call Apps Script, read browser storage, open SQLite, or
 * award anything. A trusted gateway must be supplied by the host application;
 * all values coming from the browser are treated as untrusted input.
 */

export const IDENTITY_SOURCE = 'B_LOCKED_SESSION';
export const GOLD_SOURCE_SCHEMA = 'north12b-formal-gold-source/v1';
export const DAILY_GOLD_SNAPSHOT_SCHEMA = 'north12b-daily-gold/v1';
export const GAME_GOLD_TO_COINS = 50;

export const CANONICAL_STORES = Object.freeze([
  '三創', '萬大', '通化', '杭州南', '復興南', '酒泉', '大稻埕', '六張犁', '永吉',
]);

export const SQLITE_LAYERS = Object.freeze({
  prototype: 'city_v4_prototype',
  trustedIdentity: 'city_v4_trusted_identity',
  formalEvents: 'city_v4_formal_events',
  goldImports: 'city_v4_gold_imports',
});

const GATEWAY_MARKER = Symbol('city-v4 trusted gateway');
const REPORT_ATTESTATION = Symbol('city-v4 server-attested report');
const GOLD_ATTESTATION = Symbol('city-v4 server-attested gold');

class ContractError extends Error {
  constructor(code, message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'FormalContractError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ContractError(code, message); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const text = (value, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const stableId = value => typeof value === 'string' && /^[A-Z0-9]{5,12}$/.test(value);
const isoDate = value => {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const positiveExpiry = (value, now) => Number.isSafeInteger(value) && value > now;
const nonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

export function canonicalStore(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, '')
    .replace(/^台灣大哥大數位生活台北/, '')
    .replace(/^台灣大哥大台北/, '')
    .replace(/^台北/, '');
  return CANONICAL_STORES.includes(normalized) ? normalized : null;
}

function freezeIdentity(candidate, now) {
  if (!isRecord(candidate)) fail('IDENTITY_RESULT_INVALID');
  if (candidate.source !== IDENTITY_SOURCE) fail('IDENTITY_SOURCE_INVALID');
  if (!stableId(candidate.employeeId)) fail('IDENTITY_EMPLOYEE_ID_INVALID');
  const store = canonicalStore(candidate.store);
  if (!store) fail('IDENTITY_STORE_INVALID');
  if (candidate.active !== true) fail('IDENTITY_INACTIVE');
  if (!positiveExpiry(candidate.expiresAt, now)) fail('IDENTITY_EXPIRED');
  if (!text(candidate.sessionEpoch, 128)) fail('IDENTITY_SESSION_EPOCH_INVALID');
  return Object.freeze({
    employeeId: candidate.employeeId,
    store,
    active: true,
    expiresAt: candidate.expiresAt,
    sessionEpoch: candidate.sessionEpoch,
    source: IDENTITY_SOURCE,
  });
}

function makeEventBinding(marker, identity, identityGeneration) {
  return Object.freeze({
    marker,
    employeeId: identity.employeeId,
    sessionEpoch: identity.sessionEpoch,
    expiresAt: identity.expiresAt,
    identityGeneration,
  });
}

function bindingMatches(binding, marker, identity, identityGeneration) {
  return isRecord(binding)
    && binding.marker === marker
    && binding.employeeId === identity.employeeId
    && binding.sessionEpoch === identity.sessionEpoch
    && binding.expiresAt === identity.expiresAt
    && binding.identityGeneration === identityGeneration;
}

/**
 * Build an in-process gateway from a server-result validator.
 *
 * The callback is deliberately injected by the host. It must return the
 * server-derived identity fields; a client profile or JSON copy cannot create
 * the private marker used by requireTrustedIdentity.
 */
export function createTrustedGateway(validator, eventVerifiers = {}) {
  if (typeof validator !== 'function') fail('GATEWAY_VALIDATOR_REQUIRED');
  if (!isRecord(eventVerifiers)) fail('EVENT_VERIFIERS_INVALID');
  if (eventVerifiers.reportVerifier !== undefined && typeof eventVerifiers.reportVerifier !== 'function') fail('REPORT_VERIFIER_INVALID');
  if (eventVerifiers.goldVerifier !== undefined && typeof eventVerifiers.goldVerifier !== 'function') fail('GOLD_VERIFIER_INVALID');
  let identity = null;
  let identityGeneration = 0;
  const gateway = {
    async verify(serverResult, now = Date.now()) {
      identityGeneration += 1;
      identity = null;
      if (!Number.isSafeInteger(now)) fail('CLOCK_INVALID');
      // A failed replacement verification must never leave an older session
      // usable in the city process.
      try {
        const candidate = await validator(serverResult);
        identity = freezeIdentity(candidate, now);
        return identity;
      } catch (error) {
        identity = null;
        throw error;
      }
    },
    clear() {
      identityGeneration += 1;
      identity = null;
    },
  };
  const marker = {
    getIdentity: () => identity,
    getGeneration: () => identityGeneration,
    async attestReport(receipt, expected, options = {}) {
      if (typeof eventVerifiers.reportVerifier !== 'function') fail('REPORT_ATTESTATION_UNAVAILABLE');
      const actor = identity;
      const generation = identityGeneration;
      if (!actor) fail('TRUSTED_SESSION_REQUIRED');
      const providerResult = await eventVerifiers.reportVerifier(receipt, expected, actor, options);
      if (identity !== actor || identityGeneration !== generation) fail('REPORT_ATTESTATION_STALE');
      if (isRecord(providerResult) && own(providerResult, 'employeeId') && providerResult.employeeId !== actor.employeeId) fail('REPORT_EMPLOYEE_MISMATCH');
      const structural = validateFormalReportReceipt(providerResult, expected, options);
      return Object.freeze({
        ...structural,
        employeeId: actor.employeeId,
        [REPORT_ATTESTATION]: makeEventBinding(marker, actor, generation),
      });
    },
    async attestGold(source, options = {}) {
      if (typeof eventVerifiers.goldVerifier !== 'function') fail('GOLD_ATTESTATION_UNAVAILABLE');
      const actor = identity;
      const generation = identityGeneration;
      if (!actor) fail('TRUSTED_SESSION_REQUIRED');
      const providerResult = await eventVerifiers.goldVerifier(source, actor, options);
      if (identity !== actor || identityGeneration !== generation) fail('GOLD_ATTESTATION_STALE');
      if (isRecord(providerResult) && own(providerResult, 'employeeId') && providerResult.employeeId !== actor.employeeId) fail('GOLD_EMPLOYEE_MISMATCH');
      const structural = validateFormalGoldSource(providerResult);
      return Object.freeze({
        ...structural,
        [GOLD_ATTESTATION]: makeEventBinding(marker, actor, generation),
      });
    },
  };
  Object.defineProperty(gateway, GATEWAY_MARKER, {
    value: Object.freeze(marker),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(gateway);
}

/**
 * Require a previously verified identity. Raw client employeeId/profile fields
 * are intentionally ignored and a JSON-deserialized gateway is rejected.
 */
export function requireTrustedIdentity(context, now = Date.now()) {
  if (!isRecord(context) || !Number.isSafeInteger(now)) fail('TRUSTED_CONTEXT_REQUIRED');
  const gateway = context.trustedGateway;
  const marker = gateway && gateway[GATEWAY_MARKER];
  if (!marker || typeof marker.getIdentity !== 'function') fail('TRUSTED_GATEWAY_REQUIRED');
  const identity = marker.getIdentity();
  if (!identity) fail('TRUSTED_SESSION_REQUIRED');
  return freezeIdentity(identity, now);
}

export async function attestFormalReportReceipt(context, receipt, expected, options = {}) {
  if (!isRecord(context)) fail('TRUSTED_CONTEXT_REQUIRED');
  const gateway = context.trustedGateway;
  const marker = gateway && gateway[GATEWAY_MARKER];
  if (!marker || typeof marker.attestReport !== 'function') fail('TRUSTED_GATEWAY_REQUIRED');
  requireTrustedIdentity(context, options.now ?? Date.now());
  return marker.attestReport(receipt, expected, options);
}

const REPORT_READBACK_FIELDS = Object.freeze([
  'date', 'store', 'seg', 'aq999', 'aq1399', 'haosu', 'rt999', 'rt1399',
  'insurance_num', 'insurance_den', 'insurance_pct', 'management_focus_json',
]);

function sameValue(left, right) {
  return Object.is(left, right) || (left !== null && right !== null && typeof left === 'object' && typeof right === 'object' && JSON.stringify(left) === JSON.stringify(right));
}

/**
 * Validate the formal server receipt shape. This is structural validation;
 * callers must use acceptFormalReportReceipt with a trusted gateway before
 * treating the result as an authenticated event.
 */
export function validateFormalReportReceipt(receipt, expected, options = {}) {
  if (!isRecord(receipt) || !isRecord(expected)) fail('REPORT_RECEIPT_INVALID');
  if (receipt.status !== 'ok' || receipt.rowWritten !== true || receipt.readbackMatches !== true) fail('REPORT_RECEIPT_UNCONFIRMED');
  if (!text(receipt.sourceEventId, 160)) fail('REPORT_SOURCE_EVENT_ID_INVALID');
  if (!isoDate(expected.date) || receipt.date !== expected.date) fail('REPORT_DATE_MISMATCH');
  if (!CANONICAL_STORES.includes(expected.store) || receipt.store !== expected.store) fail('REPORT_STORE_MISMATCH');
  if (![16, 21].includes(Number(expected.seg)) || Number(receipt.seg) !== Number(expected.seg)) fail('REPORT_SEGMENT_MISMATCH');
  if (!text(receipt.spreadsheetId, 240)) fail('REPORT_SPREADSHEET_ID_MISSING');
  const normalized = {
    status: 'ok',
    rowWritten: true,
    readbackMatches: true,
    date: receipt.date,
    store: receipt.store,
    seg: Number(receipt.seg),
    sourceEventId: receipt.sourceEventId,
    spreadsheetId: receipt.spreadsheetId,
    sheetName: text(receipt.sheetName, 160) ? receipt.sheetName : '',
    readback: null,
  };
  if (Number(expected.seg) === 21) {
    if (!isRecord(receipt.readback)) fail('REPORT_2100_READBACK_MISSING');
    if (!REPORT_READBACK_FIELDS.every(field => own(receipt.readback, field))) fail('REPORT_2100_READBACK_INCOMPLETE');
    if (receipt.readback.date !== expected.date || receipt.readback.store !== expected.store || Number(receipt.readback.seg) !== 21) fail('REPORT_2100_READBACK_IDENTITY_MISMATCH');
    if (isRecord(options.expectedData)) {
      for (const field of REPORT_READBACK_FIELDS) {
        if (own(options.expectedData, field) && !sameValue(receipt.readback[field], options.expectedData[field])) fail(`REPORT_2100_FIELD_MISMATCH_${field}`);
      }
    }
    normalized.readback = Object.freeze({ ...receipt.readback });
  }
  return Object.freeze(normalized);
}

export function acceptFormalReportReceipt(context, receipt, expected, options = {}) {
  const identity = requireTrustedIdentity(context, options.now ?? Date.now());
  const gateway = context.trustedGateway;
  const marker = gateway && gateway[GATEWAY_MARKER];
  if (!marker || typeof marker.getGeneration !== 'function') fail('REPORT_ATTESTATION_REQUIRED');
  const binding = receipt?.[REPORT_ATTESTATION];
  if (!binding || binding.marker !== marker) fail('REPORT_ATTESTATION_REQUIRED');
  if (!bindingMatches(binding, marker, identity, marker.getGeneration())) fail('REPORT_ATTESTATION_STALE');
  const validated = validateFormalReportReceipt(receipt, expected, options);
  if (validated.store !== identity.store || expected.store !== identity.store) fail('REPORT_IDENTITY_STORE_MISMATCH');
  if (own(receipt, 'employeeId') && receipt.employeeId !== identity.employeeId) fail('REPORT_EMPLOYEE_MISMATCH');
  return Object.freeze({ ...validated, employeeId: identity.employeeId, store: identity.store });
}

function validateGoldMapping(row, index) {
  if (!isRecord(row) || !stableId(row.employeeId)) fail('GOLD_EMPLOYEE_MAPPING_INVALID', `gold mapping ${index}`);
  const store = canonicalStore(row.store);
  if (!store) fail('GOLD_STORE_INVALID', `gold mapping ${index}`);
  if (!isoDate(row.date)) fail('GOLD_DATE_INVALID', `gold mapping ${index}`);
  if (!nonNegativeInteger(row.delta)) fail('GOLD_DELTA_INVALID', `gold mapping ${index}`);
  return Object.freeze({ employeeId: row.employeeId, store, date: row.date, delta: row.delta });
}

/**
 * Formal gold input contract. The existing daily-gold snapshot is explicitly
 * not accepted because its personKey/alias rows are not a stable employee map.
 */
export function validateFormalGoldSource(source) {
  if (isRecord(source) && source.schema === DAILY_GOLD_SNAPSHOT_SCHEMA) fail('GOLD_SNAPSHOT_NOT_EMPLOYEE_SOURCE');
  if (!isRecord(source) || source.schema !== GOLD_SOURCE_SCHEMA) fail('GOLD_SOURCE_SCHEMA_INVALID');
  if (!text(source.sourceId, 160) || !/^[A-Za-z0-9_-]+$/.test(source.sourceId)) fail('GOLD_SOURCE_ID_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(source.sourceHash || ''))) fail('GOLD_SOURCE_HASH_INVALID');
  if (!isoDate(source.date)) fail('GOLD_DATE_INVALID');
  if (!text(source.importKey, 200) || !/^[A-Za-z0-9_.:-]+$/.test(source.importKey)) fail('GOLD_IMPORT_KEY_INVALID');
  if (!text(source.authoritativeReceipt, 240)) fail('GOLD_AUTHORITY_RECEIPT_MISSING');
  if (!Array.isArray(source.mappings) || source.mappings.length === 0) fail('GOLD_MAPPINGS_MISSING');
  const mappings = source.mappings.map((row, index) => {
    const mapped = validateGoldMapping({ ...row, date: row?.date || source.date }, index);
    if (mapped.date !== source.date) fail('GOLD_DATE_MISMATCH');
    return mapped;
  });
  const employeeIds = new Set(mappings.map(row => row.employeeId));
  if (employeeIds.size !== mappings.length) fail('GOLD_EMPLOYEE_DUPLICATE');
  return Object.freeze({
    schema: GOLD_SOURCE_SCHEMA,
    sourceId: source.sourceId,
    sourceHash: source.sourceHash,
    date: source.date,
    importKey: source.importKey,
    authoritativeReceipt: source.authoritativeReceipt,
    mappings: Object.freeze(mappings),
  });
}

export function acceptFormalGoldSource(context, source, seenImportKeys = new Set(), options = {}) {
  const identity = requireTrustedIdentity(context, options.now ?? Date.now());
  if (!(seenImportKeys instanceof Set)) fail('GOLD_IMPORT_LEDGER_REQUIRED');
  const gateway = context.trustedGateway;
  const marker = gateway && gateway[GATEWAY_MARKER];
  if (!marker || typeof marker.getGeneration !== 'function') fail('GOLD_ATTESTATION_REQUIRED');
  const binding = source?.[GOLD_ATTESTATION];
  if (!binding || binding.marker !== marker) fail('GOLD_ATTESTATION_REQUIRED');
  if (!bindingMatches(binding, marker, identity, marker.getGeneration())) fail('GOLD_ATTESTATION_STALE');
  const validated = validateFormalGoldSource(source);
  const mapping = validated.mappings.find(row => row.employeeId === identity.employeeId && row.store === identity.store);
  if (!mapping) fail('GOLD_EMPLOYEE_NOT_MAPPED');
  const importKey = `${identity.employeeId}:${validated.sourceId}:${validated.importKey}`;
  if (seenImportKeys.has(importKey)) fail('GOLD_IMPORT_ALREADY_APPLIED');
  seenImportKeys.add(importKey);
  return Object.freeze({ ...validated, employeeId: identity.employeeId, store: identity.store });
}

export async function attestFormalGoldSource(context, source, options = {}) {
  if (!isRecord(context)) fail('TRUSTED_CONTEXT_REQUIRED');
  const gateway = context.trustedGateway;
  const marker = gateway && gateway[GATEWAY_MARKER];
  if (!marker || typeof marker.attestGold !== 'function') fail('TRUSTED_GATEWAY_REQUIRED');
  requireTrustedIdentity(context, options.now ?? Date.now());
  return marker.attestGold(source, options);
}

export function validateExplicitCost(cost) {
  if (!isRecord(cost) || !nonNegativeInteger(cost.coins) || !nonNegativeInteger(cost.gold)) fail('COST_EXPLICIT_FIELDS_REQUIRED');
  return Object.freeze({ coins: cost.coins, gold: cost.gold, gameGoldToCoins: GAME_GOLD_TO_COINS });
}

export { ContractError };
