#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  throw new Error('usage: migrate_b2_prompt_renewable_oauth.mjs <source> <output>');
}
const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg);
let text = await fs.readFile(sourcePath, 'utf8');

function replaceExact(before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, got ${count}`);
  text = text.replace(before, after);
}

const sourceParagraph = '下載檔必須放入含 run_id 與 cloud item ID 或 hash 的 run-scoped staging，staged SHA 必須與 cloud download SHA 相同。';
replaceExact(
  sourceParagraph,
  `${sourceParagraph}\n\nGraph production auth 固定使用 \`ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth\`。runtime 必須先用 MSAL silent acquire／refresh 從 macOS Keychain service \`North12BOneDriveGraphMsalCache\` 取得有效 token；token、refresh credential 與 serialized cache 不得進入 Git、logs、stdout 或 manifest。只有沒有 cached account 或 Microsoft 明確要求互動時回報 \`AUTH_RECONSENT_REQUIRED\`。既有 \`North12BOneDriveGraphAccessToken\` 只可在人工 UAT／緊急測試明確設定 \`ONEDRIVE_GRAPH_AUTH_MODE=direct-token\` 時使用；production 不得自動選用，也不得因 auth 失敗 fallback 本機。`,
  'renewable auth contract',
);

replaceExact(
  '`REPORT_DATE_ISO=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/run_daily_north12b_report.mjs`',
  '`ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth REPORT_DATE_ISO=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/run_daily_north12b_report.mjs`',
  'production runner command',
);

replaceExact(
  '`REPORT_DATE_ISO=YYYY-MM-DD REPORT_DATA_CUTOFF_DATE=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/preflight_onedrive_cloud_sources.mjs`',
  '`ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth REPORT_DATE_ISO=YYYY-MM-DD REPORT_DATA_CUTOFF_DATE=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/preflight_onedrive_cloud_sources.mjs`',
  'production awards preflight command',
);

for (const required of [
  'ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth',
  'North12BOneDriveGraphMsalCache',
  'AUTH_RECONSENT_REQUIRED',
  'ONEDRIVE_GRAPH_AUTH_MODE=direct-token',
]) {
  if (!text.includes(required)) throw new Error(`renewable auth rule missing: ${required}`);
}

await fs.writeFile(outputPath, text, 'utf8');
console.log(JSON.stringify({ status: 'updated', output: outputPath }));
