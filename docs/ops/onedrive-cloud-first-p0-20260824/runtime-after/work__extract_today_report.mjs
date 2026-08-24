import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { extractSourceDateRange } from "./source_date_range.mjs";

const sourcePath = process.env.REPORT_SOURCE ?? "/Users/liamlu/Downloads/liam-agent/report-automation/input/0615.xlsx";
const sourceFile = process.env.REPORT_SOURCE_FILE ?? sourcePath.split("/").pop();
const outputPath =
  process.env.REPORT_DATA_OUTPUT ?? "/Users/liamlu/Downloads/liam-agent/report-automation/work/today_report_data.json";
const reportDateIso = process.env.REPORT_DATE_ISO ?? new Date().toISOString().slice(0, 10);

const stores = [
  "台北酒泉",
  "台北萬大",
  "台北大稻埕",
  "台北復興南",
  "台灣大哥大數位生活台北三創",
  "台北杭州南",
  "台北永吉",
  "台北通化",
  "台北六張犁",
];

const displayStore = {
  台灣大哥大數位生活台北三創: "台北三創",
};

const blocks = {
  72: {
    "HBO Max&Disney+&Prime Video": 11,
    Netflix多享組: 15,
  },
  114: {
    Device專案銷售: 20,
  },
  128: {
    重點Device銷售量: 2,
    好速案銷售點數: 6,
    換約淨新增金額: 11,
    "空機、3C及門市營收": 15,
    配件及其他營收: 20,
  },
  142: {
    包膜與保貼: 2,
    手機保險: 6,
    "MyVideo&KKBOX": 11,
  },
  156: {
    "Apple/Google服務開通": 2,
  },
};

const otherKpiBlocks = {
  72: {
    "5G銷售數": 6,
    TTL_AQ上線點數: 20,
  },
  86: {
    自退數: 6,
    "解約後NP OUT": 11,
    "解約後NP OUT(督導績)": 15,
  },
  100: {
    "AQ V+D 999（含）以上": 2,
    "AQ V+D 1399（含）以上": 6,
    預付卡開卡面額: 11,
    RT上線點數: 15,
  },
  114: {
    特殊維繫用戶續約數: 2,
    高高特維用戶續約數: 6,
    "RT V+D 999（含）以上": 11,
    "RT V+D 1399（含）以上": 15,
  },
  128: {
    好速案銷售點數: 6,
  },
};

const otherMetricLabels = {
  TTL_AQ上線點數: "TTL AQ上線點數",
};

const addonWeights = {
  Device專案銷售: 0.02,
  重點Device銷售量: 0.03,
  換約淨新增金額: 0.02,
  "空機、3C及門市營收": 0.01,
  配件及其他營收: 0.01,
  包膜與保貼: 0.01,
  手機保險: 0.01,
  "MyVideo&KKBOX": 0.01,
  "Apple/Google服務開通": 0.0025,
  "HBO Max&Disney+&Prime Video": 0.0075,
  Netflix多享組: 0.005,
};

const addonCaps = {
  "MyVideo&KKBOX": 1.5,
};

function asFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function capFor(metric) {
  return addonCaps[metric] ?? 2.5;
}

function readMetric(row, startCol) {
  let targetCol = startCol + 1;
  let weightCol = startCol + 2;
  let achievementCol = startCol + 3;
  if (startCol === 15) {
    targetCol = startCol + 2;
    weightCol = startCol + 3;
    achievementCol = startCol + 4;
  }
  return {
    actual: asFloat(row[startCol]),
    target: asFloat(row[targetCol]),
    weight: asFloat(row[weightCol]),
    achievement: asFloat(row[achievementCol]),
  };
}

function emptyRecord(store, overrideDisplayStore = null) {
  return {
    store,
    display_store: overrideDisplayStore ?? displayStore[store] ?? store.replace("台北", ""),
    district: "北一二B",
    company_rank: null,
    overall_kpi: null,
    metrics: {},
    other_metrics: {},
  };
}

function formatGeneratedDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${year}/${month}/${day}`;
}

function extractDateRange(sheetValues) {
  return extractSourceDateRange(sheetValues.slice(0, 12), reportDateIso);
}

function extractCompanyRanks(rankValues, records, aggregate) {
  for (const row of rankValues) {
    const district = row[2];
    const store = row[4];
    const rank = asFloat(row[6]);
    const overallKpi = asFloat(row[7]);
    if (store === "北一二B") {
      aggregate.company_rank = rank !== null ? Math.trunc(rank) : null;
      if (overallKpi !== null) aggregate.overall_kpi = overallKpi;
      continue;
    }
    if (district !== "北一二B") continue;
    if (records[store]) {
      records[store].company_rank = rank !== null ? Math.trunc(rank) : null;
      if (overallKpi !== null) records[store].overall_kpi = overallKpi;
    }
  }
}

function readBlockMetrics(sheetValues, records, aggregate, blockMap, bucket) {
  for (const [headerRowRaw, metricCols] of Object.entries(blockMap)) {
    const headerRow = Number(headerRowRaw);
    for (let rowIndex = headerRow + 2; rowIndex < Math.min(headerRow + 20, sheetValues.length); rowIndex += 1) {
      const row = sheetValues[rowIndex] ?? [];
      const store = row[0];
      if (!records[store] && store !== "合計") continue;
      const target = store === "合計" ? aggregate : records[store];
      const overallKpi = asFloat(row[1]);
      if (overallKpi !== null) target.overall_kpi = overallKpi;
      for (const [metricKey, startCol] of Object.entries(metricCols)) {
        const metric = otherMetricLabels[metricKey] ?? metricKey;
        target[bucket][metric] = readMetric(row, startCol);
      }
      if (store === "合計") break;
    }
  }
}

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const kpiSheet = workbook.worksheets.items.find((sheet) => sheet.name === "上線數KPI_達成率");
const rankSheet = workbook.worksheets.items.find((sheet) => sheet.name === "上線數KPI_店點達成率_明細");

if (!kpiSheet) throw new Error("Missing required sheet: 上線數KPI_達成率");
if (!rankSheet) throw new Error("Missing required sheet: 上線數KPI_店點達成率_明細");

const kpiValues = kpiSheet.getRange("A1:X170").values;
const rankValues = rankSheet.getRange("A1:H260").values;
const records = Object.fromEntries(stores.map((store) => [store, emptyRecord(store)]));
const aggregate = emptyRecord("北一二B整體", "北一二B整體");

readBlockMetrics(kpiValues, records, aggregate, blocks, "metrics");
readBlockMetrics(kpiValues, records, aggregate, otherKpiBlocks, "other_metrics");
extractCompanyRanks(rankValues, records, aggregate);

for (const record of [aggregate, ...Object.values(records)]) {
  let score = 0;
  for (const [metric, weight] of Object.entries(addonWeights)) {
    const achievement = record.metrics[metric]?.achievement ?? 0;
    score += Math.min(Math.max(achievement, 0), capFor(metric)) * weight * 100;
  }
  record.addon_score = Number(score.toFixed(2));
  record.source_date_range = extractDateRange(kpiValues);
}

const ranked = Object.values(records).sort((a, b) => (b.overall_kpi ?? 0) - (a.overall_kpi ?? 0));
ranked.forEach((record, index) => {
  record.kpi_rank = index + 1;
});
aggregate.kpi_rank = "-";

const output = {
  title: "北一二B 加掛類得分大盤解析",
  source_file: sourceFile,
  source_path: sourcePath,
  source_date_range: extractDateRange(kpiValues),
  generated_date: formatGeneratedDate(reportDateIso),
  report_date_iso: reportDateIso,
  report_note: "公司排名取自「上線數KPI_店點達成率_明細」，主力KPI與加掛得分取自「上線數KPI_達成率」。",
  aggregate,
  records: Object.values(records).sort((a, b) => (a.kpi_rank ?? 9999) - (b.kpi_rank ?? 9999)),
  columns: [
    "Device專案銷售",
    "重點Device銷售量",
    "換約淨新增金額",
    "空機、3C及門市營收",
    "配件及其他營收",
    "包膜與保貼",
    "手機保險",
    "MyVideo&KKBOX",
    "Apple/Google服務開通",
    "HBO Max&Disney+&Prime Video",
    "Netflix多享組",
  ],
  other_kpi_columns: [
    "5G銷售數",
    "TTL AQ上線點數",
    "自退數",
    "解約後NP OUT",
    "解約後NP OUT(督導績)",
    "AQ V+D 999（含）以上",
    "AQ V+D 1399（含）以上",
    "預付卡開卡面額",
    "RT上線點數",
    "特殊維繫用戶續約數",
    "高高特維用戶續約數",
    "RT V+D 999（含）以上",
    "RT V+D 1399（含）以上",
    "好速案銷售點數",
  ],
};

await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(outputPath);

// The spreadsheet runtime can leave background handles open after import completes.
// Exit explicitly so the parent runner does not hang waiting for this helper.
process.exit(0);
