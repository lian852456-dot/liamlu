import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createBatchIdentity,
  evaluateDateSignals,
  parseReportEndDate,
  parseSourceFileDate,
  resolveGuardsMode,
  sha256File,
} from "../automation_guards.mjs";
import { TestIdempotencyLedger } from "../automation-shadow/test-ledger.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const reportRoot = path.join(workspaceRoot, "report-automation");
const outputRoot = path.join(reportRoot, "outputs");
const sourceRoot = path.join(reportRoot, "input", "google-drive");
const executionRoot = path.join(repoRoot, "test-output", `TEST_20260729_${new Date().toISOString().replace(/[:.]/g, "-")}`);
const ledger = new TestIdempotencyLedger(path.join(executionRoot, "ledger"));
const dates = ["2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29"];
const actualDriveIds = {
  "2026-07-29": "15YxVEjtGBsRPIY4NzOsZaJWquSWnupbS",
};

function dateToken(isoDate) {
  return isoDate.slice(5).replace("-", "");
}

function formalHashPaths(isoDate) {
  const mmdd = dateToken(isoDate);
  return [
    path.join(sourceRoot, `${mmdd}.xlsx`),
    path.join(outputRoot, `TWM_North12B_Daily_Report_${isoDate}.xlsx`),
    path.join(outputRoot, `TWM_North12B_Main_KPI_${isoDate}.png`),
    path.join(outputRoot, `TWM_North12B_Addon_Score_${isoDate}.png`),
    path.join(outputRoot, `email_body_daily_${isoDate}.txt`),
    path.join(outputRoot, `email_body_phone_awards_${isoDate}.txt`),
  ];
}

async function hashFiles(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async (filePath) => [filePath, await sha256File(filePath)])));
}

async function existingWebsiteJson() {
  const candidates = [
    path.join(repoRoot, "data", "daily-momentum.json"),
    path.join(repoRoot, "data", "phone-awards-latest.json"),
    path.join(repoRoot, "private-data", "kpi-battle-latest.json"),
    path.join(repoRoot, "private-data", "phone-awards-battle-latest.json"),
  ];
  const existing = [];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      existing.push(candidate);
    } catch {
      // Missing historical website snapshots are reported, never fabricated.
    }
  }
  return existing;
}

function parseDailyMessage(message) {
  const source = message.match(/資料來源：([^\s]+)\s+\((\d{4}\/\d{2}\/\d{2}\s*~\s*\d{2}\/\d{2})\)/);
  const aggregate = message.match(/北一二B整體｜KPI\s+([0-9.]+)%.*?｜加掛\s+([0-9.]+)\s+分/);
  const storeSection = message.match(/各店KPI｜達成｜排名｜增減：\n([\s\S]*?)\n\n【排名快訊】/);
  const storeLines = storeSection?.[1].split("\n").filter((line) => /^- .+｜KPI /.test(line)) ?? [];
  return {
    sourceFile: source?.[1] ?? null,
    sourceDateRange: source?.[2] ?? null,
    aggregateKpiPercent: aggregate ? Number(aggregate[1]) : null,
    aggregateAddonScore: aggregate ? Number(aggregate[2]) : null,
    storeLines,
  };
}

assert.equal(resolveGuardsMode(process.env), "shadow", "Golden comparison requires explicit shadow mode");
await fs.mkdir(executionRoot, { recursive: true });

const formalPaths = dates.flatMap(formalHashPaths);
assert.equal(formalPaths.length, 42);
const beforeHashes = await hashFiles(formalPaths);
const websitePaths = await existingWebsiteJson();
const websiteBeforeHashes = await hashFiles(websitePaths);
const daily = [];
let previousSuccess = null;

for (const executionDate of dates) {
  const mmdd = dateToken(executionDate);
  const sourcePath = path.join(sourceRoot, `${mmdd}.xlsx`);
  const sourceStat = await fs.stat(sourcePath);
  const sourceSha256 = await sha256File(sourcePath);
  const personal = JSON.parse(await fs.readFile(path.join(outputRoot, `personal_kpi_report_${executionDate}.json`), "utf8"));
  const mplus = JSON.parse(await fs.readFile(path.join(outputRoot, `mplus_delivery_${executionDate}.json`), "utf8"));
  const dailyPackage = mplus.packages.find((item) => item.kind === "daily");
  const awardPackage = mplus.packages.find((item) => item.kind === "phone_awards");
  const parsedDaily = parseDailyMessage(dailyPackage?.message_text ?? "");
  const emailDaily = (await fs.readFile(path.join(outputRoot, `email_body_daily_${executionDate}.txt`), "utf8")).trim();
  const emailAwards = (await fs.readFile(path.join(outputRoot, `email_body_phone_awards_${executionDate}.txt`), "utf8")).trim();
  const execution = {
    executionDate,
    sourceFileDate: parseSourceFileDate(`${mmdd}.xlsx`, executionDate),
    reportEndDate: parseReportEndDate(parsedDaily.sourceDateRange),
  };
  const signals = evaluateDateSignals({
    ...execution,
    sourceSha256,
    previousSuccess,
  });
  const sourceFileId = actualDriveIds[executionDate] ?? `TEST-LOCAL-${mmdd}-${sourceSha256.slice(0, 12)}`;
  const identity = createBatchIdentity({
    reportEndDate: execution.reportEndDate,
    sourceFileId,
    sourceModifiedTime: sourceStat.mtime.toISOString(),
    sourceSha256,
  });
  await ledger.initialize(identity, {
    shadowOnly: true,
    sourceIdEvidence: actualDriveIds[executionDate] ? "GAS execution record" : "test-only local surrogate",
  });
  await ledger.recordStage(identity.batchId, "SOURCE_FOUND", { sourcePath });
  await ledger.recordStage(identity.batchId, "SOURCE_VALIDATED", { signals });
  await ledger.recordStage(identity.batchId, "REPORT_GENERATED", { comparedOnly: true });
  await ledger.recordStage(identity.batchId, "IMAGE_GENERATED", { comparedOnly: true });
  await ledger.recordStage(identity.batchId, "EMAIL_PREPARED", { comparedOnly: true });

  const people = Object.values(personal.categories ?? {}).reduce((sum, category) => sum + Number(category.people ?? 0), 0);
  const semanticChecks = {
    nineStores: parsedDaily.storeLines.length === 9,
    personalRows: personal.rows === 40,
    categoryPeople: people === 40,
    kpiCalculationPresent: Number.isFinite(parsedDaily.aggregateKpiPercent),
    addonCalculationPresent: Number.isFinite(parsedDaily.aggregateAddonScore),
    sourceRangePresent: Boolean(parsedDaily.sourceDateRange),
    phoneItemsTen: awardPackage?.message_text.includes("phone_items 檢查：10") ?? false,
    dailyEmailTextUnchanged: emailDaily === dailyPackage?.message_text.trim(),
    awardEmailTextUnchanged: emailAwards === awardPackage?.message_text.trim(),
    dailyAttachmentsPresent: (dailyPackage?.attachments ?? []).every((item) => item.size > 0),
    awardAttachmentsPresent: (awardPackage?.attachments ?? []).every((item) => item.size > 0),
  };
  assert.ok(Object.values(semanticChecks).every(Boolean), `${executionDate} semantic comparison failed`);
  assert.equal(signals.blocking, false);

  daily.push({
    ...execution,
    sourceFile: `${mmdd}.xlsx`,
    sourceFileId,
    sourceIdEvidence: actualDriveIds[executionDate] ? "GAS execution record" : "test-only local surrogate",
    sourceModifiedTime: sourceStat.mtime.toISOString(),
    sourceSha256,
    batchId: identity.batchId,
    sourceDateRange: parsedDaily.sourceDateRange,
    storeCount: parsedDaily.storeLines.length,
    personCount: personal.rows,
    aggregateKpiPercent: parsedDaily.aggregateKpiPercent,
    aggregateAddonScore: parsedDaily.aggregateAddonScore,
    dateSignals: signals,
    semanticChecks,
  });
  previousSuccess = { reportEndDate: execution.reportEndDate, sourceSha256 };
}

const afterHashes = await hashFiles(formalPaths);
const websiteAfterHashes = await hashFiles(websitePaths);
const changedFormalFiles = formalPaths.filter((filePath) => beforeHashes[filePath] !== afterHashes[filePath]);
const changedWebsiteFiles = websitePaths.filter((filePath) => websiteBeforeHashes[filePath] !== websiteAfterHashes[filePath]);
assert.deepEqual(changedFormalFiles, []);
assert.deepEqual(changedWebsiteFiles, []);

const result = {
  generatedAt: new Date().toISOString(),
  mode: resolveGuardsMode(process.env),
  scope: "TEST ONLY - no production writes",
  dates,
  formalHashCount: formalPaths.length,
  formalHashesUnchanged: changedFormalFiles.length === 0,
  changedFormalFiles,
  websiteSnapshotCount: websitePaths.length,
  websiteHashesUnchanged: changedWebsiteFiles.length === 0,
  changedWebsiteFiles,
  websiteGoldenCoverage:
    websitePaths.length === 4
      ? "現有四份 latest JSON 前後 hash 一致；缺少七天逐日網站快照，無法完整 Golden Comparison"
      : `僅取得 ${websitePaths.length}/4 份現有 latest JSON；缺少七天逐日網站快照，無法完整 Golden Comparison`,
  businessOutputRegenerated: false,
  daily,
};
const resultPath = path.join(executionRoot, "golden-comparison.json");
await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ resultPath, formalHashCount: 42, dates: daily.length, changedFormalFiles, changedWebsiteFiles }, null, 2));
