import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { OneDriveGraphClient, resolveOneDriveCloudSourceSet } from "./onedrive_cloud_source.mjs";
import { acquireOneDriveGraphAccessToken } from "./onedrive_graph_auth.mjs";

const sourceDir =
  process.env.REPORT_SOURCE_DIR ??
  path.resolve(import.meta.dirname, "../input/google-drive");
const workDir = path.resolve(import.meta.dirname);
const defaultOutputDir = path.resolve(workDir, "../outputs");
const automationMemoryPath = "/Users/liamlu/.codex/automations/b-2/memory.md";
const sourceDirResolved = path.resolve(sourceDir);
const sourceMode = String(process.env.REPORT_SOURCE_MODE ?? "google-drive-cloud").trim();
const localEmergencyEnabled = process.env.REPORT_LOCAL_EMERGENCY_ENABLED === "1";
const cloudStagingRoot = process.env.ONEDRIVE_CLOUD_STAGING_ROOT
  ?? path.resolve(workDir, "../input/onedrive-cloud");
const googleDriveSourceManifestPath = String(process.env.GOOGLE_DRIVE_SOURCE_MANIFEST ?? "").trim();
const dataOutput =
  process.env.REPORT_DATA_OUTPUT ?? path.join(workDir, "today_report_data.json");
const reportDateIso =
  process.env.REPORT_DATE_ISO ??
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const previousDateIso =
  process.env.REPORT_PREVIOUS_DATE_ISO ??
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${reportDateIso}T00:00:00+08:00`).getTime() - 24 * 60 * 60 * 1000);
const previousDataOutput =
  process.env.REPORT_PREVIOUS_DATA_OUTPUT ?? path.join(workDir, `report_data_${previousDateIso}.json`);

function isInsideSourceDir(targetPath) {
  const resolved = path.resolve(targetPath);
  return resolved === sourceDirResolved || resolved.startsWith(`${sourceDirResolved}${path.sep}`);
}

function outputPathFromEnv(envValue, fallbackPath, label) {
  if (!envValue) return fallbackPath;
  if (!isInsideSourceDir(envValue)) return envValue;
  console.warn(`${label} 指向來源資料夾，已改用本機輸出：${fallbackPath}`);
  return fallbackPath;
}

const outputPath =
  outputPathFromEnv(
    process.env.REPORT_OUTPUT_PATH,
    path.join(defaultOutputDir, `北一二Ｂ每日戰報＿${reportDateIso}.xlsx`),
    "REPORT_OUTPUT_PATH",
  );
const mainKpiImagePath =
  outputPathFromEnv(
    process.env.REPORT_MAIN_KPI_IMAGE_PATH,
    path.join(defaultOutputDir, `北一二Ｂ每日戰報＿${reportDateIso}＿主力KPI.png`),
    "REPORT_MAIN_KPI_IMAGE_PATH",
  );
const addonImagePath =
  outputPathFromEnv(
    process.env.REPORT_ADDON_IMAGE_PATH,
    path.join(defaultOutputDir, `北一二Ｂ每日戰報＿${reportDateIso}＿加掛得分.png`),
    "REPORT_ADDON_IMAGE_PATH",
  );
const englishAttachmentPath =
  outputPathFromEnv(
    process.env.REPORT_EMAIL_ATTACHMENT_PATH,
    path.join(defaultOutputDir, `TWM_North12B_Daily_Report_${reportDateIso}.xlsx`),
    "REPORT_EMAIL_ATTACHMENT_PATH",
  );
const englishMainKpiImagePath =
  outputPathFromEnv(
    process.env.REPORT_EMAIL_MAIN_KPI_IMAGE_PATH,
    path.join(defaultOutputDir, `TWM_North12B_Main_KPI_${reportDateIso}.png`),
    "REPORT_EMAIL_MAIN_KPI_IMAGE_PATH",
  );
const englishAddonImagePath =
  outputPathFromEnv(
    process.env.REPORT_EMAIL_ADDON_IMAGE_PATH,
    path.join(defaultOutputDir, `TWM_North12B_Addon_Score_${reportDateIso}.png`),
    "REPORT_EMAIL_ADDON_IMAGE_PATH",
  );
const pythonBin =
  process.env.PYTHON_BIN ??
  "/Users/liamlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12";
const personalManagerImagePath = path.join(defaultOutputDir, `TWM_North12B_Personal_Manager_${reportDateIso}.png`);
const personalDeputyImagePath = path.join(defaultOutputDir, `TWM_North12B_Personal_Deputy_${reportDateIso}.png`);
const personalSalesImagePath = path.join(defaultOutputDir, `TWM_North12B_Personal_Sales_${reportDateIso}.png`);
const insuranceImagePath = path.join(defaultOutputDir, `TWM_North12B_Insurance_${reportDateIso}.png`);
const qisImagePath = path.join(defaultOutputDir, `TWM_North12B_QIS_${reportDateIso}.png`);
const supplementalSummaryPath = path.join(defaultOutputDir, `supplemental_daily_report_${reportDateIso}.json`);

async function flushPendingAutomationMemory() {
  let entries;
  try {
    entries = await fs.readdir(defaultOutputDir, { withFileTypes: true });
  } catch (error) {
    console.warn(`無法讀取 pending automation memory 目錄：${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const pendingFiles = entries
    .filter((entry) => entry.isFile() && /^b-2-memory-pending-.*\.md$/.test(entry.name))
    .map((entry) => path.join(defaultOutputDir, entry.name))
    .sort();
  if (pendingFiles.length === 0) return;

  for (const pendingFile of pendingFiles) {
    try {
      const content = await fs.readFile(pendingFile, "utf8");
      const existing = await fs.readFile(automationMemoryPath, "utf8").catch(() => "");
      if (!existing.includes(content.trim())) {
        await fs.appendFile(automationMemoryPath, `${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}\n${content.trim()}\n`, "utf8");
      }
      await fs.rename(pendingFile, `${pendingFile}.applied`);
      console.warn(`已併回 pending automation memory：${path.basename(pendingFile)}`);
    } catch (error) {
      console.warn(`pending automation memory 尚未併回：${path.basename(pendingFile)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function dateTokens(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Set([
    `${year}${mm}${dd}`,
    `${year}-${mm}-${dd}`,
    `${year}_${mm}_${dd}`,
    `${mm}${dd}`,
    `${month}${dd}`,
    `${mm}${day}`,
    `${month}${day}`,
  ]);
}

function stem(filename) {
  return filename.replace(/\.[^.]+$/, "");
}

function hasMatchingDate(filename, tokens) {
  const base = stem(filename);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`);
    if (pattern.test(base)) return true;
  }
  return false;
}

async function pickSourceFileForDate(isoDate) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.xlsx$/i.test(entry.name)) continue;
    const fullPath = path.join(sourceDir, entry.name);
    const stat = await fs.stat(fullPath);
    files.push({ name: entry.name, path: fullPath, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
  }

  const tokens = dateTokens(isoDate);
  const matches = files.filter((file) => hasMatchingDate(file.name, tokens)).sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (matches.length > 0) {
    const matchingHashes = await Promise.all(matches.map(async (file) => ({
      file,
      sha256: await fileHash(file),
    })));
    if (new Set(matchingHashes.map((entry) => entry.sha256)).size !== 1) {
      throw new Error(
        `同日 KPI 來源有多個 SHA-256 不同的候選檔，禁止以 mtime 任選：`
        + matchingHashes.map((entry) => `${entry.file.name}=${entry.sha256}`).join(', '),
      );
    }
    return { selected: matches[0], candidates: files.sort((a, b) => b.mtimeMs - a.mtimeMs) };
  }
  return { selected: null, candidates: files.sort((a, b) => b.mtimeMs - a.mtimeMs) };
}

async function assertLooksLikeXlsx(file) {
  const handle = await fs.open(file.path, "r");
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const isZip = bytesRead === 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (!isZip) {
      throw new Error(`${file.name} 不是有效的 xlsx zip 檔，請重新下載 Google Drive raw 檔後再執行。`);
    }
  } finally {
    await handle.close();
  }
}

async function fileHash(file) {
  const content = await fs.readFile(file.path);
  return createHash("sha256").update(content).digest("hex");
}

function runNodeScript(scriptPath, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: workDir,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workDir,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

let selected;
let candidates = [];
let previousSelected = null;
let cloudManifest = null;
if (sourceMode === "google-drive-cloud") {
  if (!googleDriveSourceManifestPath) {
    throw new Error("production KPI source requires GOOGLE_DRIVE_SOURCE_MANIFEST; no OneDrive/local fallback is permitted");
  }
  const manifest = JSON.parse(await fs.readFile(path.resolve(googleDriveSourceManifestPath), "utf8"));
  if (manifest.schema_version !== "north12b-google-drive-cloud-source/v1"
      || manifest.provider !== "google-drive-cloud"
      || manifest.report_run_date !== reportDateIso
      || manifest.status !== "preflight-pass") {
    throw new Error("Google Drive cloud manifest schema/provider/date/status is invalid");
  }
  const kpi = manifest.sources?.kpi;
  const expectedName = `${reportDateIso.slice(5).replace("-", "")}.xlsx`;
  if (!kpi || kpi.provider !== "google-drive-cloud" || kpi.canonical_basename !== expectedName
      || !kpi.driveItemId || !kpi.lastModifiedDateTime || !kpi.sha256
      || kpi.sha256 !== kpi.staged_sha256 || !kpi.staged_path) {
    throw new Error("Google Drive KPI immutable identity is incomplete");
  }
  selected = {
    name: expectedName,
    path: kpi.staged_path,
    mtimeIso: kpi.lastModifiedDateTime,
    cloudIdentity: kpi,
    manifestPath: path.resolve(googleDriveSourceManifestPath),
  };
  candidates = [selected];
  cloudManifest = manifest;
} else if (sourceMode === "onedrive-cloud") {
  await fs.mkdir(cloudStagingRoot, { recursive: true });
  const runId = process.env.REPORT_RUN_ID
    ?? `kpi-cloud-${reportDateIso.replaceAll("-", "")}-${Date.now()}`;
  cloudManifest = await resolveOneDriveCloudSourceSet({
    graphClient: new OneDriveGraphClient({ accessToken: await acquireOneDriveGraphAccessToken() }),
    reportRunDate: reportDateIso,
    runId,
    stagingRoot: cloudStagingRoot,
    folderPath: process.env.ONEDRIVE_GRAPH_FOLDER_PATH || "TWM每日戰報",
    requiredKinds: ["kpi"],
  });
  const manifestPath = path.join(cloudManifest.staging_dir, "cloud-kpi-source-manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(cloudManifest, null, 2)}\n`, { flag: "wx" });
  selected = {
    name: cloudManifest.sources.kpi.canonical_basename,
    path: cloudManifest.sources.kpi.staged_path,
    mtimeIso: cloudManifest.sources.kpi.lastModifiedDateTime,
    cloudIdentity: cloudManifest.sources.kpi,
    manifestPath,
  };
  candidates = [selected];
} else if (sourceMode === "local-emergency" && localEmergencyEnabled) {
  ({ selected, candidates } = await pickSourceFileForDate(reportDateIso));
  ({ selected: previousSelected } = await pickSourceFileForDate(previousDateIso));
} else {
  throw new Error(
    "production KPI source mode must be google-drive-cloud; local fallback requires "
    + "REPORT_SOURCE_MODE=local-emergency and REPORT_LOCAL_EMERGENCY_ENABLED=1",
  );
}

await flushPendingAutomationMemory();

if (!selected) {
  console.error(`找不到符合 ${reportDateIso} 的來源檔。候選檔案如下：`);
  for (const candidate of candidates) {
    console.error(`- ${candidate.name} (${candidate.mtimeIso})`);
  }
  process.exit(2);
}

await assertLooksLikeXlsx(selected);
if (previousSelected) {
  await assertLooksLikeXlsx(previousSelected);
  const [todayHash, previousHash] = await Promise.all([fileHash(selected), fileHash(previousSelected)]);
  if (todayHash === previousHash) {
    console.error(
      `${selected.name} 與 ${previousSelected.name} 內容雜湊相同，疑似把前日或 smoke-test 檔誤當今日來源。請重新下載 ${reportDateIso} 的正式來源檔。`,
    );
    process.exit(3);
  }
}

// The daily KPI and both award reports are one formal batch.  Reject an
// incomplete or different-business-date award pair before producing any KPI
// workbook, image, Y26 output, mail payload, or website snapshot.
if (sourceMode === "local-emergency") {
  await runCommand(pythonBin, [path.join(workDir, "update_phone_awards.py")], {
    REPORT_DATE_ISO: reportDateIso,
    REPORT_RUN_ID: `source-batch-${reportDateIso.replaceAll("-", "")}`,
    REPORT_KPI_SOURCE: selected.path,
    PHONE_AWARDS_SOURCE_MODE: "local-emergency",
    PHONE_AWARDS_LOCAL_EMERGENCY_ENABLED: "1",
    PHONE_AWARDS_VERIFY_BATCH_ONLY: "1",
  });
}

if (previousSelected) {
  await runNodeScript(path.join(workDir, "extract_today_report.mjs"), {
    REPORT_SOURCE: previousSelected.path,
    REPORT_SOURCE_FILE: previousSelected.name,
    REPORT_DATA_OUTPUT: previousDataOutput,
    REPORT_DATE_ISO: previousDateIso,
  });
} else {
  console.warn(`找不到符合 ${previousDateIso} 的前日來源檔，將產出不含前日比較欄位的報表。`);
}

await runNodeScript(path.join(workDir, "extract_today_report.mjs"), {
  REPORT_SOURCE: selected.path,
  REPORT_SOURCE_FILE: selected.name,
  REPORT_DATA_OUTPUT: dataOutput,
  REPORT_DATE_ISO: reportDateIso,
});

await runCommand(pythonBin, [
  path.join(workDir, "build_personal_kpi_report.py"),
  selected.path,
  "--report-date",
  reportDateIso,
  "--output-dir",
  defaultOutputDir,
  ...(previousSelected ? ["--previous-source", previousSelected.path] : []),
]);

await runCommand(pythonBin, [
  path.join(workDir, "build_daily_supplemental_reports.py"),
  selected.path,
  "--report-date",
  reportDateIso,
  "--output-dir",
  defaultOutputDir,
  ...(previousSelected ? ["--previous-source", previousSelected.path] : []),
]);

await runNodeScript(path.join(workDir, "build_today_report.mjs"), {
  REPORT_DATA_INPUT: dataOutput,
  REPORT_SUPPLEMENTAL_DATA_INPUT: supplementalSummaryPath,
  ...(previousSelected ? { REPORT_PREVIOUS_DATA_INPUT: previousDataOutput } : {}),
  REPORT_OUTPUT_PATH: outputPath,
  REPORT_OUTPUT_DIR: path.dirname(outputPath),
  REPORT_MAIN_KPI_IMAGE_PATH: mainKpiImagePath,
  REPORT_ADDON_IMAGE_PATH: addonImagePath,
});

await fs.copyFile(outputPath, englishAttachmentPath);
await fs.copyFile(mainKpiImagePath, englishMainKpiImagePath);
await fs.copyFile(addonImagePath, englishAddonImagePath);

for (const attachmentPath of [
  englishAttachmentPath,
  englishMainKpiImagePath,
  englishAddonImagePath,
  personalManagerImagePath,
  personalDeputyImagePath,
  personalSalesImagePath,
  insuranceImagePath,
  qisImagePath,
]) {
  await runCommand("xattr", ["-c", attachmentPath]);
}

console.log(JSON.stringify({
  report_date_iso: reportDateIso,
  source_file: selected.name,
  source_path: selected.path,
  source_provider: sourceMode,
  source_identity: selected.cloudIdentity ?? null,
  source_manifest_path: selected.manifestPath ?? null,
  output_path: outputPath,
  main_kpi_image_path: mainKpiImagePath,
  addon_image_path: addonImagePath,
  email_attachment_path: englishAttachmentPath,
  email_main_kpi_image_path: englishMainKpiImagePath,
  email_addon_image_path: englishAddonImagePath,
  personal_manager_image_path: personalManagerImagePath,
  personal_deputy_image_path: personalDeputyImagePath,
  personal_sales_image_path: personalSalesImagePath,
  insurance_image_path: insuranceImagePath,
  qis_image_path: qisImagePath,
}, null, 2));
