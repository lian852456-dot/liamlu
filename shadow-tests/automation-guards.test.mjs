import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createBatchIdentity,
  createShadowState,
  evaluateDateSignals,
  evaluateSourceSignals,
  finalizeShadowState,
  parseReportEndDate,
  parseSourceFileDate,
  recordShadowFailure,
  recordShadowStage,
  resolveGuardsMode,
} from "../automation_guards.mjs";
import { TestIdempotencyLedger } from "../automation-shadow/test-ledger.mjs";
import {
  MockOutlookConnector,
  RETRY_DELAYS_MS,
  sendWithMockRetry,
  sendWithTestLedger,
} from "../automation-shadow/mock-outlook.mjs";
import { createPendingDelivery } from "../automation-shadow/pending-delivery.mjs";
import { TestLastKnownGoodPublisher } from "../automation-shadow/last-known-good.mjs";

const testOutputRoot = path.resolve(import.meta.dirname, "../test-output");

async function makeTestDir(prefix) {
  await fs.mkdir(testOutputRoot, { recursive: true });
  return fs.mkdtemp(path.join(testOutputRoot, `${prefix}-`));
}

function identity(seed, reportEndDate = "2026-07-28") {
  return createBatchIdentity({
    reportEndDate,
    sourceFileId: `test-source-${seed}`,
    sourceModifiedTime: `2026-07-29T0${seed}:00:00.000Z`,
    sourceSha256: String(seed).repeat(64).slice(0, 64),
  });
}

test("feature flag defaults to off and phase 2 accepts shadow only", () => {
  assert.equal(resolveGuardsMode({}), "off");
  assert.equal(resolveGuardsMode({ AUTOMATION_GUARDS_MODE: "shadow" }), "shadow");
  assert.throws(() => resolveGuardsMode({ AUTOMATION_GUARDS_MODE: "enforce" }), /only supports off or shadow/);
});

test("0729 date fields preserve execution, file, and report end as separate values", () => {
  const executionDate = "2026-07-29";
  const sourceFileDate = parseSourceFileDate("0729.xlsx", executionDate);
  const reportEndDate = parseReportEndDate("2026/07/01 ~ 07/28");
  assert.deepEqual({ executionDate, sourceFileDate, reportEndDate }, {
    executionDate: "2026-07-29",
    sourceFileDate: "2026-07-29",
    reportEndDate: "2026-07-28",
  });
  const result = evaluateDateSignals({ executionDate, sourceFileDate, reportEndDate, sourceSha256: "a".repeat(64) });
  assert.equal(result.highestRisk, "NONE");
  assert.equal(result.blocking, false);
  assert.ok(result.signals.some((signal) => signal.code === "REPORT_END_ONE_DAY_BEHIND"));
});

test("date anomalies are logged as warnings without blocking shadow flow", () => {
  const future = evaluateDateSignals({
    executionDate: "2026-07-29",
    sourceFileDate: "2026-07-29",
    reportEndDate: "2026-07-30",
    sourceSha256: "b".repeat(64),
  });
  assert.equal(future.highestRisk, "HIGH");
  assert.equal(future.status, "VALIDATION_WARNING");
  assert.equal(future.blocking, false);

  const regressed = evaluateDateSignals({
    executionDate: "2026-07-29",
    sourceFileDate: "2026-07-29",
    reportEndDate: "2026-07-27",
    sourceSha256: "c".repeat(64),
    previousSuccess: { reportEndDate: "2026-07-28", sourceSha256: "b".repeat(64) },
  });
  assert.ok(regressed.signals.some((signal) => signal.code === "REPORT_END_REGRESSED"));

  const changed = evaluateDateSignals({
    executionDate: "2026-07-29",
    sourceFileDate: "2026-07-29",
    reportEndDate: "2026-07-28",
    sourceSha256: "c".repeat(64),
    previousSuccess: { reportEndDate: "2026-07-28", sourceSha256: "b".repeat(64) },
  });
  assert.ok(changed.signals.some((signal) => signal.code === "SAME_REPORT_END_HASH_CHANGED"));

  const unknown = evaluateDateSignals({
    executionDate: "2026-07-29",
    sourceFileDate: "2026-07-29",
    reportEndDate: null,
    sourceSha256: "c".repeat(64),
  });
  assert.ok(unknown.signals.some((signal) => signal.code === "REPORT_END_DATE_UNKNOWN"));
});

test("source checks detect missing, duplicate, blank, schema, row count, and repeated hashes", () => {
  const missing = evaluateSourceSignals();
  assert.equal(missing.status, "WAITING_FOR_SOURCE");
  assert.equal(missing.blocking, false);

  const duplicate = evaluateSourceSignals({
    candidates: ["0729.xlsx", "0729 (1).xlsx"],
    selectedFile: "0729.xlsx",
    fileSize: 100,
    requiredFields: ["store", "kpi"],
    actualFields: ["store", "kpi"],
    rowCount: 9,
    minimumRows: 9,
  });
  assert.equal(duplicate.status, "VALIDATION_WARNING");
  assert.ok(duplicate.signals.some((signal) => signal.code === "MULTIPLE_SAME_DATE_FILES"));

  const invalid = evaluateSourceSignals({
    candidates: ["0729.xlsx"],
    selectedFile: "0729.xlsx",
    fileSize: 0,
    requiredFields: ["store", "kpi"],
    actualFields: ["store"],
    rowCount: 0,
    minimumRows: 9,
  });
  assert.equal(invalid.status, "VALIDATION_FAILED");
  assert.equal(invalid.blocking, false);
  assert.ok(invalid.signals.some((signal) => signal.code === "SOURCE_EMPTY"));
  assert.ok(invalid.signals.some((signal) => signal.code === "SCHEMA_FIELDS_MISSING"));
  assert.ok(invalid.signals.some((signal) => signal.code === "ROW_COUNT_TOO_LOW"));

  const repeated = evaluateSourceSignals({
    candidates: ["0729.xlsx"],
    selectedFile: "0729.xlsx",
    fileSize: 100,
    requiredFields: ["store"],
    actualFields: ["store"],
    rowCount: 9,
    minimumRows: 9,
    sourceSha256: "a".repeat(64),
    previousSuccessSha256: "a".repeat(64),
  });
  assert.equal(repeated.status, "VALIDATION_WARNING");
  assert.ok(repeated.signals.some((signal) => signal.code === "SOURCE_HASH_UNCHANGED"));
});

test("shadow state marks COMPLETED only after every required stage", () => {
  const partial = createShadowState("test-partial", "shadow");
  recordShadowStage(partial, "SOURCE_FOUND");
  recordShadowStage(partial, "SOURCE_VALIDATED");
  finalizeShadowState(partial);
  assert.equal(partial.outcome, "PARTIAL_FAILURE");
  assert.ok(!partial.completedStages.includes("COMPLETED"));

  const nonRetryable = createShadowState("test-nonretryable", "shadow");
  recordShadowStage(nonRetryable, "SOURCE_FOUND");
  recordShadowFailure(nonRetryable, "NON_RETRYABLE_FAILURE", { connector: "mock" });
  finalizeShadowState(nonRetryable);
  assert.equal(nonRetryable.failureClassification, "NON_RETRYABLE_FAILURE");
  assert.equal(nonRetryable.outcome, "PARTIAL_FAILURE");
  assert.ok(!nonRetryable.completedStages.includes("COMPLETED"));

  const complete = createShadowState("test-complete", "shadow");
  for (const stage of [
    "SOURCE_FOUND",
    "SOURCE_VALIDATED",
    "REPORT_GENERATED",
    "IMAGE_GENERATED",
    "WEBSITE_STAGED",
    "EMAIL_PREPARED",
    "EMAIL_SENT",
    "DELIVERY_VERIFIED",
  ]) recordShadowStage(complete, stage);
  finalizeShadowState(complete);
  assert.equal(complete.outcome, "COMPLETED");
  assert.ok(complete.completedStages.includes("COMPLETED"));
});

test("batch identity ignores filename and test ledger exposes completed stages", async () => {
  const base = {
    reportEndDate: "2026-07-28",
    sourceFileId: "15YxVEjtGBsRPIY4NzOsZaJWquSWnupbS",
    sourceModifiedTime: "2026-07-29T03:00:00.000Z",
    sourceSha256: "a".repeat(64),
  };
  const first = createBatchIdentity({ ...base, sourceFilename: "0729.xlsx" });
  const renamed = createBatchIdentity({ ...base, sourceFilename: "renamed-0729.xlsx" });
  assert.equal(first.batchId, renamed.batchId);

  const root = await makeTestDir("ledger");
  const ledger = new TestIdempotencyLedger(path.join(root, "ledger"));
  assert.equal((await ledger.initialize(first)).created, true);
  assert.equal((await ledger.initialize(first)).created, false);
  await ledger.recordStage(first.batchId, "REPORT_GENERATED", { shadow: true });
  await ledger.recordStage(first.batchId, "EMAIL_PREPARED", { shadow: true });
  assert.equal(await ledger.hasStage(first.batchId, "REPORT_GENERATED"), true);
  const record = await ledger.read(first.batchId);
  assert.deepEqual(record.completedStages, ["REPORT_GENERATED", "EMAIL_PREPARED"]);
});

test("unsupported call is non-retryable and never loops", async () => {
  const connector = new MockOutlookConnector([
    { error: { code: "UNSUPPORTED", message: "unsupported call: send capability unavailable" } },
    { messageId: "must-not-be-used" },
  ]);
  const sleeps = [];
  const result = await sendWithMockRetry({
    connector,
    payload: { subject: "[TEST] unsupported" },
    sleep: async (ms) => sleeps.push(ms),
  });
  assert.equal(result.status, "NON_RETRYABLE_FAILURE");
  assert.equal(result.retryCount, 0);
  assert.equal(connector.calls.length, 1);
  assert.deepEqual(sleeps, []);
});

test("transient Outlook failures use fake 1/3/5 minute delays and stop after three retries", async () => {
  const transient = () => ({ error: { code: "ETIMEDOUT", message: "service temporarily unavailable timeout" } });
  const connector = new MockOutlookConnector([transient(), transient(), transient(), { messageId: "mock-receipt-1" }]);
  const sleeps = [];
  const success = await sendWithMockRetry({
    connector,
    payload: { subject: "[TEST] retry" },
    sleep: async (ms) => sleeps.push(ms),
  });
  assert.equal(success.status, "EMAIL_SENT");
  assert.equal(success.retryCount, 3);
  assert.deepEqual(sleeps, RETRY_DELAYS_MS);
  assert.equal(connector.calls.length, 4);

  const exhausted = new MockOutlookConnector([transient(), transient(), transient(), transient()]);
  const failed = await sendWithMockRetry({
    connector: exhausted,
    payload: { subject: "[TEST] exhausted" },
    sleep: async () => {},
  });
  assert.equal(failed.status, "TRANSIENT_FAILURE");
  assert.equal(failed.retryCount, 3);
  assert.equal(exhausted.calls.length, 4);
});

test("missing Outlook receipt is not EMAIL_SENT", async () => {
  const connector = new MockOutlookConnector([{ accepted: true }]);
  const result = await sendWithMockRetry({ connector, payload: { subject: "[TEST] no receipt" } });
  assert.equal(result.status, "NON_RETRYABLE_FAILURE");
  assert.equal(result.retryCount, 0);
});

test("same batch ID cannot send mock email twice", async () => {
  const root = await makeTestDir("email-ledger");
  const ledger = new TestIdempotencyLedger(path.join(root, "ledger"));
  const batch = identity(9);
  await ledger.initialize(batch);
  const connector = new MockOutlookConnector([{ messageId: "mock-only-id" }, { messageId: "must-not-send" }]);
  const first = await sendWithTestLedger({
    ledger,
    batchId: batch.batchId,
    connector,
    payload: { subject: "[TEST] idempotency" },
  });
  const second = await sendWithTestLedger({
    ledger,
    batchId: batch.batchId,
    connector,
    payload: { subject: "[TEST] idempotency" },
  });
  assert.equal(first.status, "EMAIL_SENT");
  assert.equal(second.status, "DUPLICATE_SKIPPED");
  assert.equal(connector.calls.length, 1);
});

test("pending delivery keeps test attachments and redacts secrets", async () => {
  const root = await makeTestDir("pending");
  const fixtureDir = path.join(root, "fixtures");
  await fs.mkdir(fixtureDir, { recursive: true });
  const report = path.join(fixtureDir, "TEST-report.txt");
  const image = path.join(fixtureDir, "TEST-image.txt");
  await fs.writeFile(report, "test report", "utf8");
  await fs.writeFile(image, "test image", "utf8");
  const batch = identity(2);
  const result = await createPendingDelivery({
    rootDir: path.join(root, "pending-delivery"),
    dateToken: "20260729",
    batchId: batch.batchId,
    emailPayload: {
      subject: "[TEST] pending",
      recipients: ["private-test@example.invalid"],
      token: "do-not-store",
      nested: { apiKey: "do-not-store-either" },
    },
    error: { classification: "NON_RETRYABLE_FAILURE", message: "unsupported call", password: "secret" },
    attachments: [report],
    images: [image],
    completedStages: ["REPORT_GENERATED", "IMAGE_GENERATED", "EMAIL_PREPARED"],
    remainingStages: ["EMAIL_SENT", "DELIVERY_VERIFIED", "COMPLETED"],
    retryCount: 0,
  });
  const payload = JSON.parse(await fs.readFile(path.join(result.base, "email-payload.json"), "utf8"));
  const error = JSON.parse(await fs.readFile(path.join(result.base, "error.json"), "utf8"));
  const manifest = JSON.parse(await fs.readFile(path.join(result.base, "manifest.json"), "utf8"));
  assert.equal(payload.token, "[REDACTED]");
  assert.equal(payload.nested.apiKey, "[REDACTED]");
  assert.equal(error.password, "[REDACTED]");
  assert.equal(manifest.errorClassification, "NON_RETRYABLE_FAILURE");
  assert.equal(manifest.attachments.length, 1);
  assert.equal(manifest.images.length, 1);
  assert.equal(await fs.readFile(manifest.attachments[0].path, "utf8"), "test report");
});

test("last-known-good survives all staging failures and prevents duplicate publish", async () => {
  const root = await makeTestDir("website");
  const ledger = new TestIdempotencyLedger(path.join(root, "ledger"));
  const publisher = new TestLastKnownGoodPublisher(path.join(root, "website"));
  const baseline = { reportEndDate: "2026-07-27", stores: [{ id: "baseline" }], summary: { count: 1 } };
  await publisher.seedLastKnownGood(baseline);

  for (const [seed, snapshot, fault, expectedError] of [
    [3, { reportEndDate: "2026-07-28", stores: [{ id: "new" }], summary: { count: 1 } }, "CORRUPT_JSON", "JSON_PARSE_FAILED"],
    [4, { stores: [{ id: "new" }], summary: { count: 1 } }, null, "REPORT_END_DATE_MISSING"],
    [5, { reportEndDate: "2026-07-28", stores: [], summary: { count: 0 } }, null, "STORES_EMPTY"],
    [6, { reportEndDate: "2026-07-28", stores: [{ id: "new" }], summary: { count: 1 } }, "BUILD_FAILURE", "BUILD_FAILURE"],
    [7, { reportEndDate: "2026-07-28", stores: [{ id: "new" }], summary: { count: 1 } }, "COPY_INTERRUPTED", "COPY_INTERRUPTED"],
  ]) {
    const batch = identity(seed);
    await ledger.initialize(batch);
    const result = await publisher.publish({
      batchId: batch.batchId,
      snapshot,
      expectedReportEndDate: "2026-07-28",
      ledger,
      fault,
    });
    assert.notEqual(result.status, "WEBSITE_STAGED");
    assert.ok(result.errors?.includes(expectedError) || result.error === expectedError);
    assert.deepEqual(await publisher.readCurrent(), baseline);
    assert.deepEqual(await publisher.readLastKnownGood(), baseline);
  }

  const successBatch = identity(8);
  await ledger.initialize(successBatch);
  const next = { reportEndDate: "2026-07-28", stores: [{ id: "new" }], summary: { count: 1 } };
  const success = await publisher.publish({
    batchId: successBatch.batchId,
    snapshot: next,
    expectedReportEndDate: "2026-07-28",
    ledger,
  });
  assert.equal(success.status, "WEBSITE_STAGED");
  assert.deepEqual(await publisher.readCurrent(), next);
  assert.deepEqual(await publisher.readLastKnownGood(), next);

  const duplicate = await publisher.publish({
    batchId: successBatch.batchId,
    snapshot: next,
    expectedReportEndDate: "2026-07-28",
    ledger,
  });
  assert.equal(duplicate.status, "DUPLICATE_SKIPPED");
});
