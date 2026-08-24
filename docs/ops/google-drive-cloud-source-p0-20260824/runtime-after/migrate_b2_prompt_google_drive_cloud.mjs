#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  throw new Error('usage: migrate_b2_prompt_google_drive_cloud.mjs <source> <output>');
}

const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg);
let text = await fs.readFile(sourcePath, 'utf8');

function replaceSection(startAnchor, endAnchor, replacement, label) {
  const start = text.indexOf(startAnchor);
  const end = text.indexOf(endAnchor, start + startAnchor.length);
  if (start < 0 || end < 0 || text.indexOf(startAnchor, start + 1) >= 0) {
    throw new Error(`${label}: anchors are missing or ambiguous`);
  }
  text = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

replaceSection(
  '正式來源固定為 Microsoft Graph 直接讀取 OneDrive',
  'runner 會自動抓前日比較欄位',
  '正式來源固定為已授權的 Google Drive connector 直接讀取 `01_北一二B_營運與系統/業績報表`，folder ID `1zs4flckF4uysz55tXkAxojM5-yB6a9sH`。Production 只允許 `provider=google-drive-cloud`，禁止 fallback 到 OneDrive、本機 CloudStorage、staging、outputs、cache 或舊資料；雲端列檔、下載、identity、日期或任一 canonical 檔案缺失即 BLOCKED。KPI 依 Asia/Taipei report run date 精準抓 `MMDD.xlsx`；台獎精準抓 canonical `01-08-03...店點達成率、排名及獎金.xlsx` 與 `01-08-04...個人達成率、排名及獎金.xlsx`，不得接受 duplicate suffix。每次必須保存 Google Drive file ID、canonical basename、modifiedTime、size、下載 SHA-256、Excel source_data_date 與 run_id；Google Drive API 未提供 eTag 時不得偽造。下載 bytes 必須先寫入 run-scoped transport，再由 `preflight_google_drive_cloud_sources.mjs` 建立含 run_id、file ID/hash 的 0600 immutable staging，且 staged SHA 必須等於 cloud download SHA。connector handoff 不得包含 OAuth token 或任何憑證。\\n\\n每日流程必須先用 Google Drive connector 列出固定 folder，下載今日三份 raw xlsx，建立 schema `north12b-google-drive-cloud-handoff/v1` 的 handoff JSON，明確設定 `allow_local_fallback=false`、`allow_onedrive_fallback=false`。接著執行：\\n`GOOGLE_DRIVE_CLOUD_HANDOFF=<handoff.json> REPORT_DATA_CUTOFF_DATE=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/preflight_google_drive_cloud_sources.mjs`\\n只有回傳 `status=preflight-pass`、三份 SHA 完整且三份 Excel source_data_date 全等於 KPI cutoff 才可續跑。完整每日 KPI runner 必須明確使用：\\n`REPORT_SOURCE_MODE=google-drive-cloud GOOGLE_DRIVE_SOURCE_MANIFEST=<cloud-source-manifest.json> REPORT_DATE_ISO=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/run_daily_north12b_report.mjs`\\n任何 Google Drive auth 或 connector 失敗都不得改走 OneDrive/local。\\n\\n',
  'primary source section',
);

replaceSection(
  '同次自動化還必須產出 Y26 台獎機款進度。',
  '台獎腳本必須使用 bundled Python：',
  '同次自動化還必須產出 Y26 台獎機款進度。必須沿用同一份已通過的 Google Drive cloud manifest，以 `PHONE_AWARDS_SOURCE_MODE=google-drive-cloud` 與 `PHONE_AWARDS_CLOUD_MANIFEST=<cloud-source-manifest.json>` 執行；不得重新解析另一來源、不得混用 OneDrive/local。兩份 awards raw SHA 都必須相對前一正式版本更新，任何單邊更新、hash 未變、下載/staging SHA 不一致或 source_data_date 不等於 KPI cutoff，都只維持台獎 BLOCKED，不可阻擋已通過 gate 的 KPI，也不可 fallback。\\n\\n',
  'awards source section',
);

replaceSection(
  '來源晚到 1 小時一次性續跑',
  '完成前請把本次執行摘要追加',
  '來源晚到 1 小時一次性續跑（2026-08-09 核准）：只有在 Google Drive 固定 folder 找不到 Asia/Taipei 今日 KPI canonical 來源檔時啟動；不得 fallback OneDrive 或本機。停止時執行 `node /Users/liamlu/Downloads/liam-agent/report-automation/work/late_source_retry_state.mjs schedule --report-date YYYY-MM-DD --stopped-at \'<實際 ISO-8601 停止時間>\' --delay-minutes 60`，讀取 `retryAt`，用 Codex automation_update 建立附著於本次 task 的一次性 local heartbeat/follow-up，準確排在 retryAt；不得改動本 automation 的 09:45 RRULE，不得建立高頻輪詢或第二次 retry。follow-up prompt 必須要求先完整讀取 `/Users/liamlu/Downloads/liam-agent/report-automation/docs/LATE_SOURCE_RETRY.md` 並以本次日期續跑。follow-up 開始時必須先以 `late_source_retry_state.mjs begin` 取得一次性執行權；若一小時後來源仍缺失，記錄 `source-still-missing` 後正常結束，不發布昨日資料，也不再排下一次。續跑前必須以 manifest、Outlook 寄件備份、Drive／網站正式讀回做冪等檢查，只補未完成項。\\n\\n',
  'late-source section',
);

for (const required of [
  'provider=google-drive-cloud',
  'north12b-google-drive-cloud-handoff/v1',
  'preflight_google_drive_cloud_sources.mjs',
  'REPORT_SOURCE_MODE=google-drive-cloud',
  'PHONE_AWARDS_SOURCE_MODE=google-drive-cloud',
  'folder ID `1zs4flckF4uysz55tXkAxojM5-yB6a9sH`',
]) {
  if (!text.includes(required)) throw new Error(`Google Drive production rule missing: ${required}`);
}
for (const forbidden of [
  '正式來源固定為 Microsoft Graph',
  'ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth',
  'preflight_onedrive_cloud_sources.mjs',
]) {
  if (text.includes(forbidden)) throw new Error(`obsolete production rule remains: ${forbidden}`);
}
if (!text.includes('status = "ACTIVE"') || !text.includes('BYHOUR=9;BYMINUTE=45')) {
  throw new Error('automation status or schedule changed unexpectedly');
}

await fs.writeFile(outputPath, text, 'utf8');
console.log(JSON.stringify({ status: 'updated', output: outputPath }));
