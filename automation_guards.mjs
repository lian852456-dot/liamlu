import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export const GUARDS_MODE_ENV = "AUTOMATION_GUARDS_MODE";
export const DEFAULT_GUARDS_MODE = "off";

export const PIPELINE_STAGES = Object.freeze([
  "SOURCE_FOUND",
  "SOURCE_VALIDATED",
  "REPORT_GENERATED",
  "IMAGE_GENERATED",
  "WEBSITE_STAGED",
  "EMAIL_PREPARED",
  "EMAIL_SENT",
  "DELIVERY_VERIFIED",
  "COMPLETED",
]);

export const OUTCOME_STATES = Object.freeze([
  "WAITING_FOR_SOURCE",
  "VALIDATION_WARNING",
  "VALIDATION_FAILED",
  "PARTIAL_FAILURE",
  "NON_RETRYABLE_FAILURE",
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function requireIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return value;
}

function dateAtUtcNoon(isoDate) {
  return new Date(`${requireIsoDate(isoDate, "date")}T12:00:00.000Z`);
}

function daysBetween(later, earlier) {
  return Math.round((dateAtUtcNoon(later) - dateAtUtcNoon(earlier)) / DAY_MS);
}

export function resolveGuardsMode(env = process.env) {
  const value = String(env[GUARDS_MODE_ENV] ?? DEFAULT_GUARDS_MODE).trim().toLowerCase();
  if (value !== "off" && value !== "shadow") {
    throw new Error(`${GUARDS_MODE_ENV} only supports off or shadow during phase 2`);
  }
  return value;
}

export function parseSourceFileDate(filename, executionDate) {
  const match = String(filename).match(/(?:^|[^0-9])(\d{2})(\d{2})(?:[^0-9]|$)/);
  if (!match) return null;
  const [, mm, dd] = match;
  const execution = dateAtUtcNoon(executionDate);
  const years = [execution.getUTCFullYear() - 1, execution.getUTCFullYear(), execution.getUTCFullYear() + 1];
  const candidates = years
    .map((year) => `${year}-${mm}-${dd}`)
    .filter((isoDate) => {
      const parsed = dateAtUtcNoon(isoDate);
      return parsed.getUTCMonth() + 1 === Number(mm) && parsed.getUTCDate() === Number(dd);
    })
    .sort((a, b) => Math.abs(daysBetween(a, executionDate)) - Math.abs(daysBetween(b, executionDate)));
  return candidates[0] ?? null;
}

export function parseReportEndDate(content) {
  if (content && typeof content === "object") {
    for (const key of ["reportEndDate", "source_date_range", "sourceDateRange", "period"]) {
      const parsed = parseReportEndDate(content[key]);
      if (parsed) return parsed;
    }
  }
  if (typeof content !== "string") return null;

  const fullRange = content.match(
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*(?:~|～|至|-)\s*(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})/,
  );
  if (fullRange) {
    const [, startYear, , , explicitEndYear, endMonth, endDay] = fullRange;
    return `${explicitEndYear ?? startYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  }

  const labeled = content.match(
    /(?:資料(?:結算|截至|截止|日期)|reportEndDate|source_date)[^0-9]*(\d{4})[/-](\d{1,2})[/-](\d{1,2})/i,
  );
  if (labeled) {
    return `${labeled[1]}-${String(labeled[2]).padStart(2, "0")}-${String(labeled[3]).padStart(2, "0")}`;
  }
  return null;
}

export function evaluateDateSignals({
  executionDate,
  sourceFileDate,
  reportEndDate,
  sourceSha256,
  previousSuccess = null,
  historicalMaxLagDays = 3,
}) {
  requireIsoDate(executionDate, "executionDate");
  const signals = [];
  let highestRisk = "NONE";
  const add = (code, risk, message) => {
    signals.push({ code, risk, message });
    if (risk === "HIGH") highestRisk = "HIGH";
    else if (risk === "WARN" && highestRisk === "NONE") highestRisk = "WARN";
  };

  if (!sourceFileDate) {
    add("SOURCE_FILE_DATE_UNKNOWN", "WARN", "無法從檔名解析 sourceFileDate");
  } else if (sourceFileDate === executionDate) {
    add("SOURCE_FILE_DATE_MATCH", "INFO", "sourceFileDate 與 executionDate 相同");
  } else {
    add("SOURCE_FILE_DATE_DIFFERS", "WARN", "sourceFileDate 與 executionDate 不同，Shadow Mode 僅記錄");
  }

  if (!reportEndDate) {
    add("REPORT_END_DATE_UNKNOWN", "HIGH", "無法從內容判斷 reportEndDate");
  } else {
    if (reportEndDate > executionDate) {
      add("REPORT_END_AFTER_EXECUTION", "HIGH", "reportEndDate 晚於 executionDate");
    }
    if (sourceFileDate) {
      const lagDays = daysBetween(sourceFileDate, reportEndDate);
      if (lagDays === 1) {
        add("REPORT_END_ONE_DAY_BEHIND", "INFO", "reportEndDate 比 sourceFileDate 早一天，符合目前正常模式");
      } else if (lagDays < 0 || lagDays > historicalMaxLagDays) {
        add("REPORT_END_OUTSIDE_HISTORY", "HIGH", "檔名日期與內容日期差異超出歷史正常範圍");
      } else if (lagDays !== 0) {
        add("REPORT_END_DELAY", "WARN", "可能為週末、假日或資料延遲，Shadow Mode 僅警示");
      }
    }
    if (previousSuccess?.reportEndDate && reportEndDate < previousSuccess.reportEndDate) {
      add("REPORT_END_REGRESSED", "HIGH", "reportEndDate 比最近成功資料更舊");
    }
    if (
      previousSuccess?.reportEndDate === reportEndDate &&
      previousSuccess?.sourceSha256 &&
      sourceSha256 &&
      previousSuccess.sourceSha256 !== sourceSha256
    ) {
      add("SAME_REPORT_END_HASH_CHANGED", "HIGH", "reportEndDate 未前進但內容 hash 改變");
    }
  }

  return {
    executionDate,
    sourceFileDate,
    reportEndDate,
    highestRisk,
    status: highestRisk === "NONE" ? "SOURCE_VALIDATED" : "VALIDATION_WARNING",
    blocking: false,
    signals,
  };
}

export function evaluateSourceSignals({
  candidates = [],
  selectedFile = null,
  fileSize = null,
  requiredFields = [],
  actualFields = [],
  rowCount = null,
  minimumRows = 1,
  sourceSha256 = null,
  previousSuccessSha256 = null,
} = {}) {
  const signals = [];
  const add = (code, risk, message) => signals.push({ code, risk, message });
  if (!selectedFile) {
    add("SOURCE_MISSING", "WARN", "今日來源尚未出現");
    return {
      status: "WAITING_FOR_SOURCE",
      highestRisk: "WARN",
      blocking: false,
      signals,
    };
  }
  if (candidates.length > 1) add("MULTIPLE_SAME_DATE_FILES", "WARN", "同日存在多份候選檔案");
  if (!Number.isFinite(fileSize) || fileSize <= 0) add("SOURCE_EMPTY", "HIGH", "來源檔案為空白");
  const missingFields = requiredFields.filter((field) => !actualFields.includes(field));
  if (missingFields.length > 0) add("SCHEMA_FIELDS_MISSING", "HIGH", `缺少必要欄位：${missingFields.join(", ")}`);
  if (!Number.isFinite(rowCount) || rowCount < minimumRows) {
    add("ROW_COUNT_TOO_LOW", "HIGH", `資料筆數低於測試最低值 ${minimumRows}`);
  }
  if (sourceSha256 && previousSuccessSha256 && sourceSha256 === previousSuccessSha256) {
    add("SOURCE_HASH_UNCHANGED", "WARN", "本次來源 hash 與上次成功來源相同");
  }
  const highestRisk = signals.some((signal) => signal.risk === "HIGH")
    ? "HIGH"
    : signals.some((signal) => signal.risk === "WARN")
      ? "WARN"
      : "NONE";
  return {
    status: highestRisk === "HIGH" ? "VALIDATION_FAILED" : highestRisk === "WARN" ? "VALIDATION_WARNING" : "SOURCE_VALIDATED",
    highestRisk,
    blocking: false,
    missingFields,
    signals,
  };
}

export function createShadowState(batchId, mode = resolveGuardsMode()) {
  return {
    batchId,
    mode,
    startedAt: new Date().toISOString(),
    completedStages: [],
    events: [],
    outcome: null,
  };
}

export function recordShadowStage(state, stage, details = {}) {
  if (!PIPELINE_STAGES.includes(stage) || stage === "COMPLETED") {
    throw new Error(`Unknown or derived pipeline stage: ${stage}`);
  }
  if (!state.completedStages.includes(stage)) state.completedStages.push(stage);
  state.events.push({ stage, at: new Date().toISOString(), details });
  return state;
}

export function recordShadowOutcome(state, outcome, details = {}) {
  if (!OUTCOME_STATES.includes(outcome)) throw new Error(`Unknown outcome state: ${outcome}`);
  state.outcome = outcome;
  state.events.push({ outcome, at: new Date().toISOString(), details });
  return state;
}

export function recordShadowFailure(state, classification, details = {}) {
  if (classification !== "NON_RETRYABLE_FAILURE") {
    throw new Error(`Unsupported failure classification: ${classification}`);
  }
  state.failureClassification = classification;
  return recordShadowOutcome(state, "PARTIAL_FAILURE", { classification, ...details });
}

export function finalizeShadowState(state, requiredStages = PIPELINE_STAGES.slice(0, -1)) {
  const missingStages = requiredStages.filter((stage) => !state.completedStages.includes(stage));
  if (missingStages.length === 0 && !state.outcome) {
    state.completedStages.push("COMPLETED");
    state.outcome = "COMPLETED";
  } else if (!state.outcome) {
    state.outcome = "PARTIAL_FAILURE";
  }
  state.finishedAt = new Date().toISOString();
  state.missingStages = missingStages;
  return state;
}

export async function sha256File(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export function createBatchIdentity({ reportEndDate, sourceFileId, sourceModifiedTime, sourceSha256 }) {
  requireIsoDate(reportEndDate, "reportEndDate");
  for (const [label, value] of Object.entries({ sourceFileId, sourceModifiedTime, sourceSha256 })) {
    if (!String(value ?? "").trim()) throw new Error(`${label} is required`);
  }
  const components = {
    reportEndDate,
    sourceFileId: String(sourceFileId),
    sourceModifiedTime: String(sourceModifiedTime),
    sourceSha256: String(sourceSha256).toLowerCase(),
  };
  const canonical = JSON.stringify(components);
  const digest = createHash("sha256").update(canonical).digest("hex");
  return {
    batchId: `${reportEndDate.replaceAll("-", "")}-${digest.slice(0, 24)}`,
    components,
    canonical,
  };
}
