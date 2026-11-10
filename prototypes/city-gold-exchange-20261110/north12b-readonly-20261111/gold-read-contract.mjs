import { createHash } from 'node:crypto';

export const DAILY_GOLD_SCHEMA = 'north12b-daily-gold/v1';
export const MAPPING_SCHEMA = 'north12b-gold-employee-map/v1';
export const READ_SCHEMA = 'north12b-gold-read/v1';
export const REGION = '北一二B';

// These are the canonical short names accepted by this isolated contract. No
// aliases such as 台北三創 are normalized or guessed into a canonical name.
export const CANONICAL_STORES = Object.freeze([
  '酒泉', '萬大', '大稻埕', '復興南', '三創', '杭州南', '永吉', '通化', '六張犁'
]);

const STORE_SET = new Set(CANONICAL_STORES);
const DATE_RE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID_RE = /^[^\s\u0000-\u001f]{1,160}$/u;
const SETTLEMENT_KEYS = ['date', 'status', 'source', 'recordedAt', 'rows'];
const ROW_KEYS = ['personKey', 'store', 'alias', 'balance', 'reason', 'exemption'];
const MAPPING_KEYS = ['employeeId', 'personKey', 'store', 'alias', 'validFrom', 'validUntil', 'evidenceId', 'status'];

export class North12BReadError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.name = 'North12BReadError';
    this.code = code;
    this.status = status;
  }
}

const fail = (code, status = 409) => { throw new North12BReadError(code, status); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, keys, code) {
  if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) fail(code, 400);
}

function nonEmptyId(value, code) {
  if (typeof value !== 'string' || !ID_RE.test(value)) fail(code, 400);
  return value;
}

function validDate(value, code = 'DATE_INVALID') {
  if (typeof value !== 'string' || !DATE_RE.test(value)) fail(code, 400);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(code, 400);
  return value;
}

function validIso(value, code) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(code, 400);
  return value;
}

function validStore(value, code = 'STORE_NOT_CANONICAL') {
  if (typeof value !== 'string' || !STORE_SET.has(value)) fail(code, 409);
  return value;
}

function resolveNow(now) {
  const value = now === undefined ? Date.now() : typeof now === 'function' ? now() : now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(value)) fail('NOW_INVALID', 400);
  return value;
}

function taipeiDate(nowMs) {
  return new Date(nowMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Stable JSON is used so a source hash is independent of object insertion
// order. It only accepts JSON-shaped values; no live objects, functions, or
// credentials can be smuggled into a provenance hash.
function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('SOURCE_NOT_JSON', 400);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined || typeof value[key] === 'function' || typeof value[key] === 'symbol') fail('SOURCE_NOT_JSON', 400);
      return `${JSON.stringify(key)}:${stableJson(value[key])}`;
    }).join(',')}}`;
  }
  fail('SOURCE_NOT_JSON', 400);
}

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneMappingEntry(entry) {
  return {
    employeeId: entry.employeeId,
    personKey: entry.personKey,
    store: entry.store,
    alias: entry.alias,
    validFrom: entry.validFrom,
    validUntil: entry.validUntil,
    evidenceId: entry.evidenceId,
    status: entry.status
  };
}

function rangesOverlap(a, b) {
  return a.validFrom <= b.validUntil && b.validFrom <= a.validUntil;
}

/**
 * Validate and copy the private employee-to-person mapping registry.
 * This is validation only; it does not authenticate a caller or access a DB.
 */
export function validateMappingRegistry(mapping) {
  exactKeys(mapping, ['schema', 'revision', 'entries'], 'MAPPING_FIELDS_INVALID');
  if (mapping.schema !== MAPPING_SCHEMA) fail('MAPPING_SCHEMA_INVALID', 400);
  if (!Number.isSafeInteger(mapping.revision) || mapping.revision < 1) fail('MAPPING_REVISION_INVALID', 400);
  if (!Array.isArray(mapping.entries)) fail('MAPPING_ENTRIES_INVALID', 400);

  const entries = mapping.entries.map(entry => {
    exactKeys(entry, MAPPING_KEYS, 'MAPPING_ENTRY_FIELDS_INVALID');
    const normalized = {
      employeeId: nonEmptyId(entry.employeeId, 'MAPPING_EMPLOYEE_INVALID'),
      personKey: nonEmptyId(entry.personKey, 'MAPPING_PERSON_INVALID'),
      store: validStore(entry.store),
      alias: nonEmptyId(entry.alias, 'MAPPING_ALIAS_INVALID'),
      validFrom: validDate(entry.validFrom, 'MAPPING_VALID_FROM_INVALID'),
      validUntil: validDate(entry.validUntil, 'MAPPING_VALID_UNTIL_INVALID'),
      evidenceId: nonEmptyId(entry.evidenceId, 'MAPPING_EVIDENCE_REQUIRED'),
      status: entry.status
    };
    if (normalized.validFrom > normalized.validUntil) fail('MAPPING_DATE_RANGE_INVALID', 409);
    if (normalized.status !== 'confirmed' && normalized.status !== 'pending') fail('MAPPING_STATUS_INVALID', 409);
    return normalized;
  });

  for (let index = 0; index < entries.length; index += 1) {
    for (let other = index + 1; other < entries.length; other += 1) {
      const a = entries[index];
      const b = entries[other];
      if ((a.employeeId === b.employeeId || a.personKey === b.personKey) && rangesOverlap(a, b)) {
        fail('MAPPING_VALIDITY_OVERLAP', 409);
      }
    }
  }

  return deepFreeze({
    schema: MAPPING_SCHEMA,
    revision: mapping.revision,
    entries: entries.map(cloneMappingEntry)
  });
}

function validateLedger(ledger, today) {
  exactKeys(ledger, ['schema', 'region', 'settlements', 'updatedAt'], 'LEDGER_FIELDS_INVALID');
  if (ledger.schema !== DAILY_GOLD_SCHEMA) fail('LEDGER_SCHEMA_INVALID', 400);
  if (ledger.region !== REGION) fail('LEDGER_REGION_INVALID', 409);
  if (!Array.isArray(ledger.settlements) || ledger.settlements.length === 0) fail('LEDGER_EMPTY', 409);
  if (ledger.updatedAt !== undefined) validIso(ledger.updatedAt, 'LEDGER_UPDATED_AT_INVALID');

  return ledger.settlements.map(settlement => {
    exactKeys(settlement, SETTLEMENT_KEYS, 'SETTLEMENT_FIELDS_INVALID');
    const date = validDate(settlement.date, 'SETTLEMENT_DATE_INVALID');
    if (date > today) fail('FUTURE_SETTLEMENT', 409);
    if (settlement.status !== 'confirmed') fail('SETTLEMENT_NOT_CONFIRMED', 409);
    if (settlement.source === undefined || settlement.source === null ||
      (typeof settlement.source === 'string' && settlement.source.trim() === '') ||
      (isObject(settlement.source) && Object.keys(settlement.source).length === 0)) fail('SOURCE_REQUIRED', 409);
    const recordedAt = validIso(settlement.recordedAt, 'RECORDED_AT_INVALID');
    if (!Array.isArray(settlement.rows) || settlement.rows.length === 0) fail('SETTLEMENT_ROWS_INVALID', 409);
    const personKeys = new Set();
    const rows = settlement.rows.map(row => {
      exactKeys(row, ROW_KEYS, 'LEDGER_ROW_FIELDS_INVALID');
      const normalized = {
        personKey: nonEmptyId(row.personKey, 'ROW_PERSON_INVALID'),
        store: validStore(row.store),
        alias: nonEmptyId(row.alias, 'ROW_ALIAS_INVALID'),
        balance: row.balance,
        reason: row.reason,
        exemption: row.exemption
      };
      if (!Number.isSafeInteger(normalized.balance)) fail('BALANCE_INVALID', 409);
      if (typeof normalized.reason !== 'string' || typeof normalized.exemption !== 'string') fail('ROW_NOTE_INVALID', 409);
      if (personKeys.has(normalized.personKey)) fail('ROW_PERSON_NOT_UNIQUE', 409);
      personKeys.add(normalized.personKey);
      return normalized;
    });
    return { date, status: 'confirmed', source: settlement.source, recordedAt, rows };
  });
}

function chooseCurrentMapping(identity, mapping, today) {
  const own = mapping.entries.filter(entry => entry.employeeId === identity.employeeId);
  if (own.length === 0) fail('MAPPING_NOT_FOUND', 404);
  const active = own.filter(entry => entry.validFrom <= today && today <= entry.validUntil);
  if (active.length === 0) {
    if (own.some(entry => entry.status === 'pending' && entry.validFrom <= today && today <= entry.validUntil)) fail('MAPPING_NOT_CONFIRMED', 409);
    if (own.every(entry => entry.validUntil < today)) fail('MAPPING_EXPIRED', 409);
    if (own.every(entry => entry.validFrom > today)) fail('MAPPING_NOT_YET_VALID', 409);
    fail('MAPPING_NOT_ACTIVE', 409);
  }
  if (active.length !== 1) fail('MAPPING_NOT_UNIQUE', 409);
  const selected = active[0];
  if (selected.status !== 'confirmed') fail('MAPPING_NOT_CONFIRMED', 409);
  if (selected.store !== identity.store) fail('MAPPING_STORE_MISMATCH', 409);
  return selected;
}

/**
 * Read only the caller's latest confirmed current-month balance.
 * The identity object must already come from the real protected B-session
 * service. This pure function checks the supplied proof shape; it cannot
 * authenticate a caller, establish a session, or authorize a database read.
 */
export function readOwnNorth12BGold(input = {}) {
  exactKeys(input, ['identity', 'ledger', 'mapping', 'now'], 'REQUEST_FIELDS_INVALID');
  const nowMs = resolveNow(input.now);
  const today = taipeiDate(nowMs);
  const identity = input.identity;
  if (!isObject(identity)) fail('IDENTITY_FIELDS_INVALID', 400);
  if (identity.source !== 'B_LOCKED_SESSION' || identity.active !== true || identity.accountKind !== 'employee') fail('IDENTITY_REQUIRED', 401);
  const employeeId = nonEmptyId(identity.employeeId, 'IDENTITY_EMPLOYEE_REQUIRED');
  const store = validStore(identity.store, 'IDENTITY_STORE_NOT_CANONICAL');
  if (typeof identity.sessionEpoch !== 'string' || identity.sessionEpoch.length === 0) fail('IDENTITY_SESSION_REQUIRED', 401);
  if (!Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= nowMs) fail('IDENTITY_EXPIRED', 401);

  const normalizedMapping = validateMappingRegistry(input.mapping);
  const mapping = chooseCurrentMapping({ employeeId, store }, normalizedMapping, today);
  const settlements = validateLedger(input.ledger, today);
  const month = today.slice(0, 7);
  const monthSettlements = settlements.filter(settlement => settlement.date.startsWith(month));
  if (monthSettlements.length === 0) fail('CURRENT_MONTH_BALANCE_MISSING', 404);
  const latestDate = monthSettlements.reduce((latest, settlement) => settlement.date > latest ? settlement.date : latest, '0000-00-00');
  const latestSettlements = monthSettlements.filter(settlement => settlement.date === latestDate);
  if (latestSettlements.length !== 1) fail('LATEST_SETTLEMENT_NOT_UNIQUE', 409);
  const selectedSettlement = latestSettlements[0];
  const ownRows = selectedSettlement.rows.filter(row => row.personKey === mapping.personKey);
  // Select the latest complete settlement first. Never fall back to an older
  // day when the latest confirmed source does not contain this employee.
  if (ownRows.length === 0) fail('LATEST_PERSON_MISSING', 404);
  if (ownRows.length !== 1) fail('LATEST_PERSON_NOT_UNIQUE', 409);
  const row = ownRows[0];
  if (selectedSettlement.date < mapping.validFrom || selectedSettlement.date > mapping.validUntil) fail('MAPPING_DATE_MISMATCH', 409);
  if (row.store !== mapping.store || row.alias !== mapping.alias) fail('ROW_MAPPING_MISMATCH', 409);
  const sourceHash = sha256(stableJson(selectedSettlement));
  return deepFreeze({
    schema: READ_SCHEMA,
    region: REGION,
    employeeId,
    personKey: mapping.personKey,
    store: mapping.store,
    alias: mapping.alias,
    balance: row.balance,
    sourceDate: selectedSettlement.date,
    sourceHash,
    sourceRecordedAt: selectedSettlement.recordedAt,
    reason: row.reason,
    exemption: row.exemption,
    mappingRevision: normalizedMapping.revision,
    mappingEvidenceId: mapping.evidenceId,
    exchangeEnabled: false,
    readOnly: true
  });
}
