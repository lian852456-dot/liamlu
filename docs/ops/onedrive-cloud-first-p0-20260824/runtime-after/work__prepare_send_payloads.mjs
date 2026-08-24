import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateSameSourceBatch } from "./source_batch_gate.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const outputDir = path.join(projectRoot, "report-automation/outputs");
const workDir = path.join(projectRoot, "report-automation/work");
const configDir = path.join(projectRoot, "report-automation/config");
const logsDir = path.join(projectRoot, "report-automation/logs");
const reportDateIso =
  process.env.REPORT_DATE_ISO ??
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const mailSubjectPrefix = String(process.env.REPORT_MAIL_SUBJECT_PREFIX ?? "").trim();
if (/[\r\n]/.test(mailSubjectPrefix)) {
  throw new Error("REPORT_MAIL_SUBJECT_PREFIX must not contain line breaks");
}
const subjectFor = (label) => `${mailSubjectPrefix}${label} ${reportDateIso}`;

const maxOutlookDirectAttachmentBytes = 3 * 1024 * 1024;
const mplusTargetThread = "滷蛋公務";
const runId = process.env.REPORT_RUN_ID ?? `${reportDateIso.replaceAll("-", "")}-preflight-${createHash("sha256").update(`${reportDateIso}-${Date.now()}`).digest("hex").slice(0, 8)}`;
const checks = [];

function recordCheck(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`${name} failed${detail ? `: ${detail}` : ""}`);
}

export function dataCutoffDateFromSourceRange(sourceDateRange, reportRunDate) {
  const matches = [...String(sourceDateRange || "").matchAll(/(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})/g)];
  if (!matches.length) throw new Error(`data cutoff date missing from source_date_range: ${sourceDateRange || ""}`);
  const last = matches.at(-1);
  const year = Number(last[1] || String(reportRunDate).slice(0, 4));
  const month = Number(last[2]);
  const day = Number(last[3]);
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`invalid data cutoff date in source_date_range: ${sourceDateRange}`);
  }
  if (value > reportRunDate) throw new Error(`data cutoff date ${value} is after report run date ${reportRunDate}`);
  return value;
}

async function sha256(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function loadActiveAwardConfig() {
  const active = JSON.parse(await fs.readFile(path.join(configDir, "award-config-active.json"), "utf8"));
  const configPath = path.join(configDir, active.activeConfig);
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  return { ...config, _path: configPath, _hash: await sha256(configPath) };
}

const REQUIRED_AWARD_SOURCE_BASENAMES = Object.freeze({
  store: "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx",
  person: "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx",
});

export function validateAwardSourceFreshness(summary, expectedRunDate) {
  const identity = summary?.source_identity;
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error("今日台獎來源尚未更新：source_identity is missing");
  }
  const runId = String(summary?.run_id || "").trim();
  if (!runId || String(summary?.report_run_date || "") !== expectedRunDate) {
    throw new Error("今日台獎來源尚未更新：run_id/report_run_date is missing or mismatched");
  }
  const freshness = summary?.source_freshness || {};
  if (!["fresh", "unchanged-source-verified-exception"].includes(freshness.status)) {
    throw new Error("今日台獎來源尚未更新：freshness status is not verified");
  }
  const result = {};
  for (const [kind, expectedBasename] of Object.entries(REQUIRED_AWARD_SOURCE_BASENAMES)) {
    const entry = identity[kind];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`今日台獎來源尚未更新：${kind} source identity is missing`);
    }
    if (String(entry.canonical_basename || "") !== expectedBasename || !String(entry.basename || "").trim()) {
      throw new Error(`今日台獎來源尚未更新：${kind} canonical basename is invalid`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(entry.sha256 || ""))) {
      throw new Error(`今日台獎來源尚未更新：${kind} SHA-256 is missing`);
    }
    if (String(entry.run_id || "") !== runId) {
      throw new Error(`今日台獎來源尚未更新：${kind} run_id mismatch`);
    }
    if (String(entry.provider || "") !== "onedrive-cloud"
        || !String(entry.driveItemId || "").trim()
        || !String(entry.eTag || "").trim()
        || Number.isNaN(Date.parse(String(entry.lastModifiedDateTime || "")))
        || !Number.isSafeInteger(Number(entry.size)) || Number(entry.size) <= 0) {
      throw new Error(`今日台獎來源尚未更新：${kind} OneDrive cloud identity is incomplete`);
    }
    const absolutePath = String(entry.absolute_path || entry.staged_path || "").trim();
    if (!absolutePath
        || /report-automation\/input\/google-drive\/phone-awards\//.test(absolutePath)
        || /report-automation\/(?:outputs|cache)\//.test(absolutePath)) {
      throw new Error(`今日台獎來源尚未更新：${kind} points at forbidden mutable fallback`);
    }
    result[kind] = {
      basename: String(entry.canonical_basename),
      canonical_basename: String(entry.canonical_basename),
      provider: "onedrive-cloud",
      driveItemId: String(entry.driveItemId),
      lastModifiedDateTime: String(entry.lastModifiedDateTime),
      eTag: String(entry.eTag),
      size: Number(entry.size),
      sha256: String(entry.sha256).toLowerCase(),
      absolute_path: absolutePath,
      run_id: runId,
      source_date_range: String(entry.source_date_range || ""),
      source_data_date: String(entry.source_data_date || ""),
      date_provenance: entry.date_provenance,
      staged_sha256: String(entry.staged_sha256 || "").toLowerCase(),
    };
  }
  if (freshness.status === "unchanged-source-verified-exception") {
    const exception = freshness.unchanged_exception;
    if (!exception?.reason || !/^[a-f0-9]{64}$/i.test(String(exception.evidence_sha256 || ""))) {
      throw new Error("今日台獎來源尚未更新：unchanged source exception is not verifiable");
    }
  }
  return result;
}

export async function validateDispatchSourceBatch({
  report,
  awardSourceIdentity,
  kpiSourceIdentity,
  reportRunDate,
  hashFile = sha256,
}) {
  const sourcePath = String(report?.source_path || "").trim();
  if (!sourcePath) throw new Error("same source batch blocked: KPI source_path is missing");
  return validateSameSourceBatch({
    reportRunDate,
    kpi: {
      ...(kpiSourceIdentity || {}),
      source_file: String(report?.source_file || sourcePath),
      sha256: await hashFile(sourcePath),
      absolute_path: sourcePath,
      source_date_range: String(report?.source_date_range || ""),
      source_data_date: dataCutoffDateFromSourceRange(report?.source_date_range, reportRunDate),
      date_provenance: kpiSourceIdentity?.date_provenance,
    },
    awards: awardSourceIdentity,
  });
}

function percent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function metricAchievement(record, key) {
  return record?.other_metrics?.[key]?.achievement ?? record?.metrics?.[key]?.achievement ?? null;
}

const metricLabels = new Map([
  ["HBO Max&Disney+&Prime Video", "串流服務"],
  ["Netflix多享組", "Netflix"],
  ["Device專案銷售", "Device"],
  ["重點Device銷售量", "重點Device"],
  ["好速案銷售點數", "好速案"],
  ["換約淨新增金額", "換約淨增"],
  ["空機、3C及門市營收", "空機/3C"],
  ["配件及其他營收", "配件"],
  ["包膜與保貼", "包膜"],
  ["手機保險", "手機保險"],
  ["MyVideo&KKBOX", "MyVideo/KKBOX"],
  ["Apple/Google服務開通", "Apple/Google"],
  ["5G銷售數", "5G"],
  ["TTL AQ上線點數", "AQ上線"],
  ["AQ V+D 999（含）以上", "A999"],
  ["AQ V+D 1399（含）以上", "A1399"],
  ["預付卡開卡面額", "預付卡"],
  ["RT上線點數", "RT上線"],
  ["特殊維繫用戶續約數", "特殊維繫"],
  ["高高特維用戶續約數", "高高特維"],
  ["RT V+D 999（含）以上", "R999"],
  ["RT V+D 1399（含）以上", "R1399"],
]);

function signed(value, digits = 1, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const rounded = Number(value).toFixed(digits);
  const normalized = rounded === "-0.0" || rounded === "-0.00" ? rounded.slice(1) : rounded;
  return `${Number(value) > 0 ? "+" : ""}${normalized}${suffix}`;
}

function changeLabel(value, positiveText, negativeText, unit) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "無前日資料";
  if (Math.abs(Number(value)) < 0.00005) return "持平";
  return `${Number(value) > 0 ? positiveText : negativeText} ${Math.abs(Number(value)).toFixed(unit === "名" ? 0 : 2)}${unit}`;
}

function previousRecordFor(record, previousByStore) {
  return previousByStore.get(record.store) ?? previousByStore.get(record.display_store) ?? null;
}

function recordChange(record, previousByStore) {
  const previous = previousRecordFor(record, previousByStore);
  if (!previous) return { rank: null, kpi: null, addon: null };
  return {
    rank: Number.isFinite(Number(previous.company_rank)) && Number.isFinite(Number(record.company_rank))
      ? Number(previous.company_rank) - Number(record.company_rank)
      : null,
    kpi: Number.isFinite(Number(previous.overall_kpi)) && Number.isFinite(Number(record.overall_kpi))
      ? Number(record.overall_kpi) - Number(previous.overall_kpi)
      : null,
    addon: Number.isFinite(Number(previous.addon_score)) && Number.isFinite(Number(record.addon_score))
      ? Number(record.addon_score) - Number(previous.addon_score)
      : null,
  };
}

function laggingMetrics(record, limit = 3) {
  const metrics = new Map();
  for (const [name, metric] of Object.entries({ ...(record.metrics ?? {}), ...(record.other_metrics ?? {}) })) {
    const achievement = Number(metric?.achievement);
    if (!Number.isFinite(achievement) || achievement >= 1) continue;
    const shortName = metricLabels.get(name) ?? name;
    const existing = metrics.get(shortName);
    if (!existing || achievement < existing.achievement) metrics.set(shortName, { achievement });
  }
  return [...metrics.entries()]
    .sort((a, b) => a[1].achievement - b[1].achievement)
    .slice(0, limit)
    .map(([name, metric]) => `${name} ${percent(metric.achievement)}`);
}

function storeKpiLine(record, previousByStore) {
  const changes = recordChange(record, previousByStore);
  const store = record.display_store ?? record.store;
  return `- ${store}｜KPI ${percent(record.overall_kpi)}｜公司排名 ${record.company_rank ?? "-"}（${changeLabel(changes.rank, "較前日上升", "較前日下降", "名")}）｜KPI增減 ${signed(changes.kpi === null ? null : changes.kpi * 100, 1, " 個百分點")}｜加掛 ${record.addon_score ?? "-"} 分（${signed(changes.addon, 2, " 分")}）`;
}

function rankDetailLine(record) {
  const store = record.display_store ?? record.store;
  return `- ${store}｜KPI ${percent(record.overall_kpi)}｜公司排名 ${record.company_rank ?? "-"}｜加掛 ${record.addon_score ?? "-"} 分`;
}

function encouragementLine(record, previousByStore) {
  const changes = recordChange(record, previousByStore);
  const store = record.display_store ?? record.store;
  const addon = Number(record.addon_score);
  const movement = changes.rank !== null && changes.rank > 0 ? "排名較前日進步，請持續維持" : "請維持目前優勢";
  const nextStep = addon >= 15 ? "KPI與加掛都達標，可把成功做法分享給其他店點" : "KPI表現亮眼，下一步把加掛得分推進到15分";
  return `- ${store}：KPI ${percent(record.overall_kpi)}、公司排名 ${record.company_rank ?? "-"}，${movement}；${nextStep}。`;
}

function reminderLine(record) {
  const store = record.display_store ?? record.store;
  const gaps = laggingMetrics(record);
  const reasons = [];
  if (Number(record.overall_kpi) < 1) reasons.push("KPI尚未達100%");
  if (Number(record.addon_score) < 15) reasons.push("加掛尚未達15分");
  const action = Number(record.overall_kpi) < 1
    ? "今日先補強上述項目，優先把KPI拉回100%以上"
    : "KPI已達標，請集中補強上述項目並把加掛推到15分";
  return `- ${store}：${reasons.join("、") || "需持續追蹤"}；主要落後項目：${gaps.join("、") || "無"}。${action}。`;
}

async function requireFile(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(`${filePath} 不是檔案`);
  if (stat.size <= 0) throw new Error(`${filePath} 是空檔`);
  if (stat.size > maxOutlookDirectAttachmentBytes) {
    throw new Error(`${filePath} 大小 ${stat.size} bytes，超過 Outlook 直接附件限制`);
  }
  const mtimeIso = stat.mtime.toISOString();
  const localDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(stat.mtime);
  if (localDate !== reportDateIso) {
    throw new Error(`${filePath} 修改日期 ${localDate} 不是 ${reportDateIso}，疑似沿用舊附件`);
  }
  return { path: filePath, size: stat.size, mtimeIso, hash: await sha256(filePath) };
}

function classifyAttachment(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg"].includes(ext)) return "image";
  return "file";
}

async function buildDailyBody(report) {
  if (report.report_date_iso !== reportDateIso) {
    throw new Error(`today_report_data.json 日期是 ${report.report_date_iso}，不是 ${reportDateIso}`);
  }
  if (supplementalSummary.report_date_iso !== reportDateIso) {
    throw new Error(`補充戰報日期是 ${supplementalSummary.report_date_iso}，不是 ${reportDateIso}`);
  }

  const records = [...report.records].sort((a, b) => Number(a.company_rank) - Number(b.company_rank));
  const [reportYear, reportMonth, reportDay] = reportDateIso.split("-").map(Number);
  const previousDate = new Date(Date.UTC(reportYear, reportMonth - 1, reportDay - 1))
    .toISOString()
    .slice(0, 10);
  let previousReport = null;
  try {
    previousReport = JSON.parse(await fs.readFile(path.join(workDir, `report_data_${previousDate}.json`), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const previousByStore = new Map();
  for (const record of [previousReport?.aggregate, ...(previousReport?.records ?? [])]) {
    if (!record) continue;
    previousByStore.set(record.store, record);
    previousByStore.set(record.display_store, record);
  }
  const overallChanges = recordChange(report.aggregate, previousByStore);
  const laggingRecords = records.filter((record) => Number(record.overall_kpi) < 1 || Number(record.addon_score) < 15);

  const lines = [
    `北一二B每日戰報 ${reportDateIso}`,
    `資料來源：${report.source_file} (${report.source_date_range})`,
    "",
    "【KPI呈現區】",
    `北一二B整體｜KPI ${percent(report.aggregate.overall_kpi)}｜公司排名 ${report.aggregate.company_rank ?? "-"}（${changeLabel(overallChanges.rank, "較前日上升", "較前日下降", "名")}）｜KPI增減 ${signed(overallChanges.kpi === null ? null : overallChanges.kpi * 100, 1, " 個百分點")}｜加掛 ${report.aggregate.addon_score ?? "-"} 分（${signed(overallChanges.addon, 2, " 分")}）`,
    `核心指標｜A999 ${percent(metricAchievement(report.aggregate, "AQ V+D 999（含）以上"))}｜好速案 ${percent(metricAchievement(report.aggregate, "好速案銷售點數"))}｜R1399 ${percent(metricAchievement(report.aggregate, "RT V+D 1399（含）以上"))}`,
    `保險｜進度 ${percent(supplementalSummary.insurance?.progress)}｜實際搭售率 ${percent(supplementalSummary.insurance?.attach_rate)}｜${Number(supplementalSummary.insurance?.sales ?? 0).toFixed(0)} / ${Number(supplementalSummary.insurance?.target ?? 0).toFixed(0)} 件`,
    `QIS｜計件數 ${Number(supplementalSummary.qis?.count ?? 0).toFixed(0)}｜原始分數 ${Number(supplementalSummary.qis?.score ?? 0).toFixed(2)}`,
    "",
    "各店KPI｜達成｜排名｜增減：",
    ...records.map((record) => storeKpiLine(record, previousByStore)),
    "",
    "【排名快訊】公司排名TOP3：",
    ...records.slice(0, 3).map(rankDetailLine),
    "【排名快訊】公司排名BOT3：",
    ...[...records].sort((a, b) => Number(b.company_rank) - Number(a.company_rank)).slice(0, 3).map(rankDetailLine),
    "",
    "【激勵】",
    ...records.slice(0, 3).map((record) => encouragementLine(record, previousByStore)),
    "",
    "【落後提醒與今日行動】",
    ...(laggingRecords.length > 0 ? laggingRecords.map(reminderLine) : ["- 各店KPI與加掛皆達標，請持續維持。"]),
    "",
    "附件：主力KPI、加掛得分、店長（含代理）個績、副店個績、業代（含銷售人員）個績、手機保險、QIS店績。",
  ];
  return `${lines.join("\n")}\n`;
}

function itemSummary(item) {
  const gap = Math.max(Number(item.gap ?? 0), 0);
  return `${item.display_name} ${Math.round(Number(item.rate) * 100)}%（尚缺 ${gap.toFixed(0)} 台）`;
}

function buildPhoneBody(summary) {
  if (summary.phone_items !== activeAwardConfig.expectedPhoneItems || summary.store_rows !== activeAwardConfig.expectedStoreRows) {
    throw new Error(`台獎門檻未通過：phone_items=${summary.phone_items}, store_rows=${summary.store_rows}`);
  }
  if (summary.config_version !== activeAwardConfig.configVersion || summary.config_hash !== activeAwardConfig._hash) {
    throw new Error(`台獎設定版本不符：summary=${summary.config_version}/${summary.config_hash}, active=${activeAwardConfig.configVersion}/${activeAwardConfig._hash}`);
  }
  if (summary.effective_month !== reportDateIso.slice(0, 7)) {
    throw new Error(`台獎設定月份 ${summary.effective_month} 與報表月份 ${reportDateIso.slice(0, 7)} 不符`);
  }

  const overall = summary.store_progress.find((row) => row.store === "北一二B整體");
  const storeRows = summary.store_progress.filter((row) => row.store !== "北一二B整體");
  if (Number(overall?.risk_threshold) !== 0.8) {
    throw new Error(`台獎整體風險門檻錯誤：risk_threshold=${overall?.risk_threshold}`);
  }
  const badStoreThreshold = storeRows.find((row) => Number(row.risk_threshold) !== 0.5);
  if (badStoreThreshold) {
    throw new Error(`${badStoreThreshold.store} 台獎店點風險門檻錯誤：risk_threshold=${badStoreThreshold.risk_threshold}`);
  }
  const priorityStores = [...storeRows]
    .sort((a, b) => Number(b.risk_count ?? b.lag_count ?? 0) - Number(a.risk_count ?? a.lag_count ?? 0) || Number(b.risks?.[0]?.gap ?? 0) - Number(a.risks?.[0]?.gap ?? 0))
    .slice(0, 3)
    .map((row) => row.store)
    .join("、");

  const body = [
    `北一二B台獎機款進度 ${reportDateIso}`,
    `北一二B整體未達80%機款：${overall?.risks?.map(itemSummary).join("、") || "無"}`,
    "",
    "各店未達50%前三大缺口與尚缺台數：",
    ...storeRows.map((row) => {
      const risks = row.risks?.slice(0, 3).map(itemSummary).join("、") || "無";
      const strengths = row.strengths?.map(itemSummary).join("、") || "無";
      return `- ${row.store}：未達50% ${risks}；可複製強項 ${strengths}`;
    }),
    "",
    `今日優先補量店點：${priorityStores}`,
    `phone_items 檢查：${summary.phone_items}`,
  ].join("\n");

  for (const requiredText of ["北一二B整體未達80%機款", "各店未達50%前三大缺口與尚缺台數", "尚缺"]) {
    if (!body.includes(requiredText)) {
      throw new Error(`台獎 mail 內文缺少必要文字：${requiredText}`);
    }
  }
  return `${body}\n`;
}

const report = JSON.parse(await fs.readFile(path.join(workDir, "today_report_data.json"), "utf8"));
const dataCutoffDate = dataCutoffDateFromSourceRange(report.source_date_range, reportDateIso);
const phoneSummary = JSON.parse(await fs.readFile(path.join(outputDir, "phone_awards_update_summary.json"), "utf8"));
const activeAwardConfig = await loadActiveAwardConfig();
const awardSourceIdentity = validateAwardSourceFreshness(phoneSummary, reportDateIso);
await fs.mkdir(logsDir, { recursive: true });
recordCheck("today_report_data date", report.report_date_iso === reportDateIso, report.report_date_iso);
recordCheck("data cutoff date", Boolean(dataCutoffDate), dataCutoffDate);
recordCheck("award source freshness", Object.keys(awardSourceIdentity).length === 2, phoneSummary.source_freshness?.status || "missing");
const sourceBatch = await validateDispatchSourceBatch({
  report,
  awardSourceIdentity,
  kpiSourceIdentity: phoneSummary?.source_batch?.kpi,
  reportRunDate: reportDateIso,
});
recordCheck("same source batch", sourceBatch.data_cutoff_date === dataCutoffDate, sourceBatch.batch_id);
recordCheck("active award config month", activeAwardConfig.effectiveMonth === reportDateIso.slice(0, 7), activeAwardConfig.effectiveMonth);
recordCheck("phone item count", phoneSummary.phone_items === activeAwardConfig.expectedPhoneItems, `${phoneSummary.phone_items}/${activeAwardConfig.expectedPhoneItems}`);
recordCheck("store row count", phoneSummary.store_rows === activeAwardConfig.expectedStoreRows, `${phoneSummary.store_rows}/${activeAwardConfig.expectedStoreRows}`);
recordCheck("phone config version", phoneSummary.config_version === activeAwardConfig.configVersion, `${phoneSummary.config_version}/${activeAwardConfig.configVersion}`);
recordCheck("phone config hash", phoneSummary.config_hash === activeAwardConfig._hash, `${phoneSummary.config_hash}/${activeAwardConfig._hash}`);
if (phoneSummary.source_files?.y26 && activeAwardConfig.sourceReport?.fileHash) {
  recordCheck("award source hash", phoneSummary.source_hashes?.y26 === activeAwardConfig.sourceReport.fileHash, `${phoneSummary.source_hashes?.y26}/${activeAwardConfig.sourceReport.fileHash}`);
}
const storeAwards = phoneSummary.store_awards ?? [];
recordCheck("store award rows complete", storeAwards.length === activeAwardConfig.expectedStoreRows, String(storeAwards.length));
const storeRanks = storeAwards.map((row) => String(row.rank ?? "").trim()).filter(Boolean);
recordCheck("store ranks complete", storeRanks.length === activeAwardConfig.expectedStoreRows, storeRanks.join(","));
const individualStoreRanks = storeAwards
  .filter((row) => String(row.store ?? "").trim() !== "北一二B整體")
  .map((row) => String(row.rank ?? "").trim())
  .filter(Boolean);
recordCheck("store ranks unique", new Set(individualStoreRanks).size === individualStoreRanks.length, individualStoreRanks.join(","));
recordCheck("2026-08-05 summary columns regression", storeAwards.some((row) => Number(row.projected) > 0 && String(row.rank ?? "").trim()), "store projected/rank present");
const supplementalSummary = JSON.parse(await fs.readFile(path.join(outputDir, `supplemental_daily_report_${reportDateIso}.json`), "utf8"));

const dailyBodyPath = path.join(outputDir, `email_body_daily_${reportDateIso}.txt`);
const phoneBodyPath = path.join(outputDir, `email_body_phone_awards_${reportDateIso}.txt`);
const mplusPayloadPath = path.join(outputDir, `mplus_delivery_${reportDateIso}.json`);
const dailyBody = await buildDailyBody(report);
for (const requiredText of ["【KPI呈現區】", "公司排名TOP3", "公司排名BOT3", "【激勵】", "【落後提醒與今日行動】", "KPI增減", "加掛", "保險", "QIS"]) {
  if (!dailyBody.includes(requiredText)) {
    throw new Error(`每日戰報 mail 內文缺少必要文字：${requiredText}`);
  }
}
await fs.writeFile(dailyBodyPath, dailyBody, "utf8");

const dailyAttachments = [
  path.join(outputDir, `TWM_North12B_Daily_Report_${reportDateIso}.xlsx`),
  path.join(outputDir, `TWM_North12B_Main_KPI_${reportDateIso}.png`),
  path.join(outputDir, `TWM_North12B_Addon_Score_${reportDateIso}.png`),
  path.join(outputDir, `TWM_North12B_Personal_Manager_${reportDateIso}.png`),
  path.join(outputDir, `TWM_North12B_Personal_Deputy_${reportDateIso}.png`),
  path.join(outputDir, `TWM_North12B_Personal_Sales_${reportDateIso}.png`),
  path.join(outputDir, `TWM_North12B_Insurance_${reportDateIso}.png`),
  path.join(outputDir, `TWM_North12B_QIS_${reportDateIso}.png`),
];
const phoneAttachments = [
  path.join(outputDir, "Y26重點台獎手機_台獎更新.xlsx"),
  path.join(outputDir, "01-08-03_手機競賽日報_店點達成率_台獎機款更新.xlsx"),
  path.join(outputDir, "01-08-04_手機競賽日報_個人達成率_個人台獎更新.xlsx"),
  path.join(outputDir, "台獎機款.png"),
  path.join(outputDir, "個人台獎.png"),
  path.join(outputDir, "台獎機款_店點進度點名.md"),
];

const payload = {
  report_date_iso: reportDateIso,
  daily: {
    status: "ready",
    subject: subjectFor("北一二B每日戰報"),
    body_path: dailyBodyPath,
    attachments: await Promise.all(dailyAttachments.map(requireFile)),
  },
};

try {
  await fs.writeFile(phoneBodyPath, buildPhoneBody(phoneSummary), "utf8");
  payload.phone_awards = {
    status: "ready",
    subject: subjectFor("北一二B台獎機款進度"),
    body_path: phoneBodyPath,
    attachments: await Promise.all(phoneAttachments.map(requireFile)),
  };
} catch (error) {
  payload.phone_awards = {
    status: "blocked",
    subject: subjectFor("北一二B台獎機款進度"),
    reason: error instanceof Error ? error.message : String(error),
    phone_items: phoneSummary.phone_items,
    store_rows: phoneSummary.store_rows,
  };
}
if (payload.phone_awards.status !== "ready") {
  throw new Error(`台獎 preflight blocked：${payload.phone_awards.reason}`);
}

const mplusPackages = [];
for (const key of ["daily", "phone_awards"]) {
  const item = payload[key];
  if (item?.status !== "ready") continue;
  const body = await fs.readFile(item.body_path, "utf8");
  mplusPackages.push({
    kind: key,
    title: item.subject,
    target_thread: mplusTargetThread,
    message_text: body.trim(),
    attachments: item.attachments.map((attachment) => ({
      ...attachment,
      name: path.basename(attachment.path),
      kind: classifyAttachment(attachment.path),
    })),
  });
}

payload.mplus = {
  status: mplusPackages.length > 0 ? "ready" : "blocked",
  target_thread: mplusTargetThread,
  payload_path: mplusPayloadPath,
  packages: mplusPackages,
  verification_required: "M+ web thread tail must show 已傳送 after each package upload.",
};
payload.run_id = runId;
payload.award_config = {
  configVersion: activeAwardConfig.configVersion,
  effectiveMonth: activeAwardConfig.effectiveMonth,
  path: activeAwardConfig._path,
  hash: activeAwardConfig._hash,
};

await fs.writeFile(mplusPayloadPath, JSON.stringify(payload.mplus, null, 2), "utf8");

const manifest = {
  runId,
  startedAt: new Date().toISOString(),
  sourceFiles: [
    report.source_file,
    phoneSummary.source_files?.store,
    phoneSummary.source_files?.person,
    phoneSummary.source_files?.y26,
  ].filter(Boolean),
  sourceHashes: phoneSummary.source_hashes ?? {},
  awardSourceIdentity,
  sourceBatch,
  configVersion: activeAwardConfig.configVersion,
  configHash: activeAwardConfig._hash,
  gitCommit: "not-a-git-repository",
  reportDate: reportDateIso,
  reportRunDate: reportDateIso,
  mailDate: reportDateIso,
  dataCutoffDate,
  validation: Object.fromEntries(checks.map((check) => [check.name, { ok: check.ok, detail: check.detail }])),
  mailSubjects: [payload.daily.subject, payload.phone_awards.subject],
  mailIds: [],
  drivePublishedAt: null,
  result: "preflight-ready",
};
const dateToken = reportDateIso.replaceAll("-", "");
await fs.writeFile(path.join(logsDir, `run-manifest-${dateToken}.json`), JSON.stringify(manifest, null, 2), "utf8");
await fs.writeFile(
  path.join(logsDir, `preflight-${dateToken}.md`),
  [
    `# Preflight ${reportDateIso}`,
    "",
    `- runId: ${runId}`,
    `- configVersion: ${activeAwardConfig.configVersion}`,
    `- result: preflight-ready`,
    "",
    "## Checks",
    ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.name}${check.detail ? `: ${check.detail}` : ""}`),
    "",
  ].join("\n"),
  "utf8",
);

console.log(JSON.stringify(payload, null, 2));
