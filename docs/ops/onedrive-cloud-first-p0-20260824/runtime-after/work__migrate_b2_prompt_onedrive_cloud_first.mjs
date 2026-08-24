#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error('usage: migrate_b2_prompt_onedrive_cloud_first.mjs <source> <output>');
const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg);
let text = await fs.readFile(sourcePath, 'utf8');

function replaceOne(pattern, replacement, label) {
  const matches = text.match(pattern);
  if (!matches || matches.length !== 1) throw new Error(`${label}: expected exactly one match`);
  text = text.replace(pattern, replacement);
}

replaceOne(
  /每日戰報來源順序固定為：\\n1\.[\s\S]*?找到來源後，必須優先使用既有 runner：\\n/,
  '正式來源固定為 Microsoft Graph 直接讀取 OneDrive `TWM每日戰報` 雲端資料夾。Production 預設禁止 fallback 到本機 CloudStorage、Google Drive、staging、outputs 或 cache；Graph 缺檔、列檔失敗、下載失敗或 identity 不完整即 BLOCKED。KPI 依 Asia\/Taipei report run date 精準抓 `MMDD.xlsx`，保存 cloud item ID、name、lastModifiedDateTime、eTag、size、下載 SHA-256、Excel period\/snapshotDay、source_data_date 與 run_id。下載檔必須放入含 run_id 與 cloud item ID 或 hash 的 run-scoped staging，staged SHA 必須與 cloud download SHA 相同。\\n\\n本機 OneDrive 僅為人工 emergency fallback，預設 OFF；只有明確同時設定 `REPORT_SOURCE_MODE=local-emergency` 與 `REPORT_LOCAL_EMERGENCY_ENABLED=1` 才可使用，且不得冒充 cloud identity。\\n\\n找到來源後，必須優先使用既有 runner：\\n',
  'daily cloud source block',
);

text = text.replace(
  'REPORT_DATE_ISO=YYYY-MM-DD REPORT_SOURCE_DIR=/Users/liamlu/Downloads/liam-agent/report-automation/input/google-drive node /Users/liamlu/Downloads/liam-agent/report-automation/work/run_daily_north12b_report.mjs',
  'REPORT_DATE_ISO=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/run_daily_north12b_report.mjs',
);

replaceOne(
  /同次自動化還必須產出 Y26 台獎機款進度。來源順序固定為：\\n1\.[\s\S]*?台獎腳本必須使用 bundled Python：\\n/,
  '同次自動化還必須產出 Y26 台獎機款進度。先以 `REPORT_DATE_ISO=YYYY-MM-DD REPORT_DATA_CUTOFF_DATE=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/preflight_onedrive_cloud_sources.mjs` 從 Graph 精準抓 canonical `01-08-03...店點達成率、排名及獎金.xlsx` 與 `01-08-04...個人達成率、排名及獎金.xlsx`；不接受 Finder duplicate suffix。兩份 cloud item ID\/eTag\/lastModifiedDateTime 都必須為 fresh，下載\/staging SHA 必須一致，兩份 Excel source_data_date 都必須等於 KPI cutoff；任一不符即只維持台獎 BLOCKED，不可阻擋已通過 gate 的 KPI，也不可 fallback 本機。\\n\\n台獎腳本必須使用 bundled Python：\\n',
  'awards cloud source block',
);

replaceOne(
  /兩封 Outlook 郵件完成 `寄件備份` 驗證後，才可執行網站資料更新。[\s\S]*?\\n\\n來源晚到 1 小時一次性續跑/,
  'KPI 與 awards 採 component-level 發布。KPI 已 fresh 時，stale awards 不得阻擋 KPI；awards fresh run 通過後只發布 `awardsBattle` component，必須逐值保留 KPI payload\/component 與 KPI hash。發布後分別從 Website 與 Supervisor App 實際 readback 台獎日期、13 機款與九店資料；未完成兩端 readback 不得標台獎 PASS。不得讀出、顯示、記錄或寫入管理者密碼。\\n\\n來源晚到 1 小時一次性續跑',
  'component publish block',
);

text = text.replace(
  '只有在 OneDrive 與 Google Drive 備援都找不到 Asia/Taipei 今日 KPI 來源檔時啟動。',
  '只有在 Microsoft Graph 找不到 Asia/Taipei 今日 KPI canonical 來源檔時啟動；不得先 fallback 本機或 Google Drive。',
);

for (const forbidden of [
  '/Users/liamlu/Library/CloudStorage/OneDrive-個人/TWM每日戰報/',
  '若 OneDrive 找不到，再查同一個 Google Drive',
  '同日多檔取修改時間最新者',
]) {
  if (text.includes(forbidden)) throw new Error(`stale production source rule remains: ${forbidden}`);
}
for (const required of ['preflight_onedrive_cloud_sources.mjs', 'REPORT_SOURCE_MODE=local-emergency', '只發布 `awardsBattle` component']) {
  if (!text.includes(required)) throw new Error(`new production source rule missing: ${required}`);
}
await fs.writeFile(outputPath, text, 'utf8');
console.log(JSON.stringify({ status: 'updated', output: outputPath }));
