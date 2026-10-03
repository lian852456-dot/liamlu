import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import {repairSemanticFormats,renderOptions} from './semantic-format.mjs';

const root = process.env.RUN_ROOT;
const out = process.env.OUT_DIR;
const reportDate = process.env.REPORT_DATE;
const generatedDate = process.env.GENERATED_DATE;
const sourceFile = process.env.SOURCE_FILE;
const processingRunId = process.env.PROCESSING_RUN_ID;
const CJK = 'Noto Sans TC';
const navy = '#17365D', yellow = '#FFCF17', green = '#DCFCE7', red = '#FEE2E2', blue = '#DBEAFE', gray = '#E2E8F0';
const reportPath = path.join(out, `TWM_North12B_Daily_Report_${reportDate}.xlsx`);
const closurePath = path.join(out, `TWM_North12B_Closure_Rate_${reportDate}.xlsx`);
const dailyPng = path.join(out, `TWM_North12B_Daily_Targets_${reportDate}.png`);
const addonPng = path.join(out, `TWM_North12B_Addon_Score_${reportDate}.png`);
const mainPng = path.join(out, `TWM_North12B_Main_KPI_${reportDate}.png`);

const daily = JSON.parse(await fs.readFile(path.join(root, 'daily-kpi-data.json'), 'utf8'));
const kpi = JSON.parse(await fs.readFile(process.env.CURRENT_KPI_PATH, 'utf8'));
const closure = JSON.parse(await fs.readFile(process.env.CLOSURE_AUDIT_PATH, 'utf8'));
const report = await SpreadsheetFile.importXlsx(await FileBlob.load(reportPath));
const closureBook = await SpreadsheetFile.importXlsx(await FileBlob.load(closurePath));

const col = (n) => { let s=''; for (n++; n; n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; };
const shortStore = (s) => String(s ?? '').includes('三創') ? '台北三創' : String(s ?? '').replace(/^台北/, '');
const fmt = (v) => Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1);
function base(sheet, range) {
  sheet.showGridLines = false;
  sheet.getRange(range).format = {font:{size:11,color:'#0F172A'},horizontalAlignment:'center',verticalAlignment:'center'};
}
function band(sheet, range, text, fill=navy, size=18) {
  sheet.getRange(range).merge();
  sheet.getRange(range.split(':')[0]).values = [[text]];
  sheet.getRange(range).format = {fill,font:{bold:true,color:'#FFFFFF',size},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:40};
}
function hdr(sheet, range) {
  sheet.getRange(range).format = {fill:yellow,font:{bold:true,color:'#17365D'},horizontalAlignment:'center',verticalAlignment:'center',wrapText:true,rowHeight:38,borders:{preset:'all',style:'thin',color:'#94A3B8'}};
}
function rateRules(range) {
  range.format.numberFormat = '0.0%';
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add('cellIs',{operator:'lessThan',formula:1,format:{fill:red,font:{color:'#DC2626',bold:true}}});
  range.conditionalFormats.add('cellIs',{operator:'greaterThanOrEqual',formula:1,format:{fill:'#F8FAFC',font:{color:'#059669',bold:true}}});
}
function scoreRules(range) {
  range.format.numberFormat = '0.00';
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add('cellIs',{operator:'lessThan',formula:15,format:{fill:red,font:{color:'#DC2626',bold:true}}});
  range.conditionalFormats.add('cellIs',{operator:'greaterThanOrEqual',formula:15,format:{fill:green,font:{color:'#059669',bold:true}}});
}

function rebuildClosure(sheet, includeSources=false) {
  const old = sheet.getUsedRange();
  if (old) { old.unmerge(); old.clear({applyTo:'all'}); }
  const plannedLast = 20 + closure.latest.formal_unclosed.length;
  base(sheet, `A1:K${plannedLast}`);
  sheet.getRange('A:A').format.columnWidth = 22;
  sheet.getRange('B:J').format.columnWidth = 12;
  sheet.getRange('K:K').format.columnWidth = 12;
  band(sheet,'A1:K1',`北一二B 締結率｜${reportDate}`);
  sheet.getRange('A2:A3').merge(); sheet.getRange('A2').values=[['店點']];
  closure.dates.forEach((date,j)=>{
    const start=1+j*3;
    sheet.getRange(`${col(start)}2:${col(start+2)}2`).merge();
    sheet.getCell(1,start).values=[[date ?? '尚未有資料']];
    sheet.getRange(`${col(start)}3:${col(start+2)}3`).values=[['分子','分母','締結率']];
  });
  sheet.getRange('K2:K3').merge(); sheet.getRange('K2').values=[['DOD（pp）']]; hdr(sheet,'A2:K3');
  closure.daily.forEach((row,i)=>{
    const r=4+i;
    sheet.getCell(r-1,0).values=[[shortStore(row.store)]];
    row.cells.forEach((cell,j)=>{
      const start=1+j*3;
      sheet.getCell(r-1,start).values=[[cell.numerator ?? '尚未有資料']];
      sheet.getCell(r-1,start+1).values=[[cell.denominator ?? '尚未有資料']];
      sheet.getCell(r-1,start+2).formulas=[[`=IF(COUNT(${col(start)}${r}:${col(start+1)}${r})<2,"尚未有資料",IF(${col(start+1)}${r}=0,"—",${col(start)}${r}/${col(start+1)}${r}))`]];
      sheet.getCell(r-1,start+2).format.numberFormat='0.0%';
    });
    sheet.getCell(r-1,10).values=[[row.dod_pp ?? '暫不比較']];
    sheet.getCell(r-1,10).format.numberFormat='+0.0"pp";-0.0"pp";0.0"pp"';
    sheet.getRange(`A${r}:K${r}`).format = {fill:i===0?'#FFF4C2':i%2?'#F8FAFC':'#FFFFFF',font:{size:11,color:'#0F172A'},rowHeight:28,borders:{preset:'all',style:'thin',color:'#CBD5E1'}};
  });
  sheet.getRange('K4:K13').conditionalFormats.add('cellIs',{operator:'lessThan',formula:0,format:{fill:red,font:{color:'#DC2626',bold:true}}});
  sheet.getRange('K4:K13').conditionalFormats.add('cellIs',{operator:'greaterThanOrEqual',formula:0,format:{fill:green,font:{color:'#059669',bold:true}}});
  band(sheet,'A15:K15','最新資料日未締結同仁｜正式名冊逐員列示');
  sheet.getRange('A16:D16').values=[['統計日期','店點','同仁（遮罩）','未締結件數']]; hdr(sheet,'A16:D16');
  const people=closure.latest.formal_unclosed;
  people.forEach((row,i)=>sheet.getRange(`A${17+i}:D${17+i}`).values=[[closure.latest.date,shortStore(row.store),row.name,row.count]]);
  const pe=16+people.length;
  sheet.getRange(`A17:D${pe}`).format={font:{size:10,color:'#0F172A'},rowHeight:25,borders:{preset:'all',style:'thin',color:'#CBD5E1'}};
  sheet.getRange(`A${pe+2}:K${pe+2}`).merge();
  sheet.getRange(`A${pe+2}`).values=[[`對帳：正式同仁 ${closure.latest.formal_staff_count} 人／${closure.latest.formal_cases} 件＋未歸屬／系統 ${closure.latest.unassigned_cases} 件＋異常 ${closure.latest.anomaly_cases} 件＝分母 ${closure.latest.denominator}－分子 ${closure.latest.numerator}＝${closure.latest.gap} 件`]];
  sheet.getRange(`A${pe+2}:K${pe+2}`).format={fill:'#EFF6FF',font:{size:10,bold:true,color:'#1E3A8A'},horizontalAlignment:'left',verticalAlignment:'center',rowHeight:28,wrapText:true};
  if(includeSources){
    sheet.getRange(`A${pe+4}:K${pe+4}`).merge();
    sheet.getRange(`A${pe+4}`).values=[['未歸屬／系統案件與來源對帳明細保留於本活頁簿其他工作表；未將非正式名冊帳號偽裝成同仁。']];
  }
  sheet.getRange(`A${pe+3}:K${pe+3}`).merge();
  sheet.getRange(`A${pe+3}`).values=[[`來源：${sourceFile}｜最近實際資料日；不足三日保留尚未有資料。DOD缺基準暫不比較。`]];
  return pe+4;
}

const closureMain = report.worksheets.getItem('締結率');
const closureLast = rebuildClosure(closureMain);
rebuildClosure(closureBook.worksheets.getItem('締結率近三日'), true);

// Update the approved short display names on the existing add-on analysis.
const labels=['Device','重點Device','換約淨','空機','配件','包膜與保貼','手機保險','Video&KKBOX','YT/天下','HBO.D+','Netflix'];
const addon=report.worksheets.getItem('加掛得分');
addon.getRange('C4:C13').values=daily.summary.map(r=>[r.rank]);
addon.getRange('C3').values=[['KPI排名']];
addon.getRange('H3:R3').values=[labels];
addon.getRange('H3:R3').format={fill:yellow,font:{bold:true,color:'#17365D',size:10},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:44,borders:{preset:'all',style:'thin',color:'#94A3B8'}};

// Title is followed immediately by table headers and data; explanatory rows are at the bottom.
const main=report.worksheets.getItem('主力KPI');
main.getRange('A2:V3').unmerge();
main.getRange('A2:V12').copyFrom(main.getRange('A3:V13'),'all');
main.getRange('A13:V14').clear({applyTo:'all'});
main.getRange('A14:V14').merge();
main.getRange('A14').values=[[`來源：${sourceFile}｜產出日期：${generatedDate}｜好速採公司正式欄位；前日無有效基準或跨月，DOD暫不比較。`]];
main.getRange('A14:V14').format={font:{size:10,color:'#475569'},horizontalAlignment:'left',rowHeight:24};
main.getRange('A2:V2').values=[[
  '營導區','店點','公司KPI\n排名','KPI','前日公司\n排名','排名變化','前日KPI','KPI增減',
  '5G銷售數','TTL AQ\n上線點數','自退數','解約後\nNP OUT','NP OUT\n（督導績）',
  'AQ V+D\n999（含）','AQ V+D\n1399（含）','預付卡\n開卡面額','RT\n上線點數',
  '特殊維繫\n續約數','高高特維\n續約數','RT V+D\n999（含）','RT V+D\n1399（含）','好速案\n銷售點數'
]];
main.getRange('A2:V2').format={font:{size:8,bold:true,color:'#0F172A'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:48};
// 區整體與門市列皆以百分比呈現，避免整體列顯示來源小數。
main.getRange('D3:D12').format.numberFormat='0.0%';
main.getRange('G3:H12').format.numberFormat='0.0%';
main.getRange('I3:V12').format.numberFormat='0.0%';
addon.getRange('A2:R3').unmerge();
addon.getRange('A2:R12').copyFrom(addon.getRange('A3:R13'),'all');
addon.getRange('A13:R14').clear({applyTo:'all'});
addon.getRange('A14:R14').merge();
addon.getRange('A14').values=[[`來源：${sourceFile}｜產出日期：${generatedDate}｜KPI排名採公司正式排名；前日缺有效資料時DOD暫不比較。`]];
addon.getRange('A14:R14').format={font:{size:10,color:'#475569'},horizontalAlignment:'left',rowHeight:24};
addon.getRange('A2:R2').values=[['營導區','店點','KPI排名','KPI','今日得分','前日得分','增減',...labels]];
addon.getRange('A2:R2').format={font:{size:8,bold:true,color:'#0F172A'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:44};
addon.getRange('D3:D12').format.numberFormat='0.0%';
addon.getRange('E3:G12').format.numberFormat='0.00';
addon.getRange('H3:R12').format.numberFormat='0.0%';

const keys=['Device專案銷售數','重點Device銷售量','換約淨新增金額','空機、3C、物聯網及門市購營收','配件及其他營收','包膜與保貼營收','手機保險服務點數','MyVideo&KKBOX','Apple&Google服務及雜誌週刊開通數','HBO Max&Disney+&Prime Video銷售數','Netflix多享組銷售數'];
const units=['數','數','元','元','元','元','點','點','數','數','數'];
const target=report.worksheets.add('加減分日目標');
const detail=report.worksheets.add('日目標公式明細');
target.reset(); detail.reset();
base(target,'A1:N28'); target.getRange('A:A').format.columnWidth=19; target.getRange('B:B').format.columnWidth=18; target.getRange('C:C').format.columnWidth=13; target.getRange('D:N').format.columnWidth=14;
band(target,'A1:N1','北一二B 加減分日目標｜目標與目前進度');
target.getRange('A2:N2').values=[['店點','內容','目前得分',...labels.map((x,i)=>`${x}\n${units[i]}／日`)]]; hdr(target,'A2:N2'); target.getRange('A2:N2').format.rowHeight=48;
base(detail,'A1:L120'); detail.getRange('A:A').format.columnWidth=18; detail.getRange('B:B').format.columnWidth=34; detail.getRange('L:L').format.columnWidth=24;
band(detail,'A1:L1','加減分日目標｜可追查公式明細');
detail.getRange('A2:L2').values=[['店點','項目','月目標','累計實績','大盤進度','全月天數','已過天數','採用倍率','100%日均','採用日目標（進位）','剩餘日均需求','口徑']]; hdr(detail,'A2:L2');

const storeByName=new Map(kpi.stores.map(s=>[shortStore(s.name),s]));
const summaryByName=new Map(daily.summary.map(s=>[shortStore(s.store),s]));
const ordered=daily.summary.slice(1).map(s=>storeByName.get(shortStore(s.store))).filter(Boolean);
ordered.forEach((store,i)=>{
  const r=5+i*2;
  target.getRange(`A${r}:A${r+1}`).merge(); target.getRange(`A${r}`).values=[[shortStore(store.name)]];
  target.getRange(`B${r}:B${r+1}`).values=[['日目標'],['進度達成率']];
  target.getRange(`C${r}:C${r+1}`).values=[['—'],[summaryByName.get(shortStore(store.name)).addon]]; scoreRules(target.getRange(`C${r+1}`));
  keys.forEach((key,j)=>{
    const item=store.items[key]; const dr=3+i*11+j;
    detail.getRange(`A${dr}:G${dr}`).values=[[shortStore(store.name),labels[j],item.t,item.a,item.reportRate,kpi.meta.monthDays,kpi.meta.snapshotDay]];
    detail.getCell(dr-1,7).formulas=[[`=IF(C${dr}=0,"—",IF(E${dr}>=1.2,1.2,1))`]];
    detail.getCell(dr-1,8).formulas=[[`=IF(C${dr}=0,"—",C${dr}/F${dr})`]];
    detail.getCell(dr-1,9).formulas=[[`=IF(C${dr}=0,"—",ROUNDUP(C${dr}*H${dr}/F${dr},0))`]];
    detail.getCell(dr-1,10).formulas=[[`=IF(OR(C${dr}=0,F${dr}<=G${dr}),"—",MAX(0,(C${dr}*H${dr}-D${dr})/(F${dr}-G${dr})))`]];
    detail.getCell(dr-1,11).values=[[item.t===0?'未設月目標':'來源大盤月目標']];
    target.getCell(r-1,j+3).formulas=[[`='日目標公式明細'!J${dr}`]];
    target.getCell(r-1,j+3).format={fill:item.t===0?gray:item.reportRate>=1.2?green:blue,font:{bold:true,color:'#0F172A'}};
    target.getCell(r,j+3).formulas=[[`='日目標公式明細'!E${dr}`]]; rateRules(target.getCell(r,j+3));
  });
  target.getRange(`A${r}:N${r+1}`).format.borders={preset:'all',style:'thin',color:'#CBD5E1'};
  target.getRange(`A${r}:B${r+1}`).format.font={bold:true,color:'#0F172A'};
});
target.getRange('A3:A4').merge(); target.getRange('A3').values=[['北一二B整體']];
target.getRange('B3:C4').values=[['日目標','—'],['進度達成率',daily.summary[0].addon]]; scoreRules(target.getRange('C4'));
keys.forEach((key,j)=>{
  const letter=col(j+3), rows=ordered.map((_,i)=>5+i*2);
  target.getCell(2,j+3).formulas=[[`=IF(COUNT(${rows.map(r=>`${letter}${r}`).join(',')})=0,"—",SUM(${rows.map(r=>`${letter}${r}`).join(',')}))`]];
  target.getCell(2,j+3).format={fill:'#FFF4C2',font:{bold:true,color:'#0F172A'},numberFormat:'#,##0'};
  target.getCell(3,j+3).values=[[kpi.aggregateRates[key]]]; rateRules(target.getCell(3,j+3));
});
target.getRange('A3:N4').format.borders={preset:'all',style:'medium',color:navy};
target.getRange('A3:C4').format={fill:'#FFF4C2',font:{bold:true,color:'#0F172A'}};
const notes=[
  '日目標藍底＝採100%；綠底＝目前進度達120%採120%；灰底＝未設月目標。',
  '目前加掛得分低於15分紅底紅字；各項達成率低於100%紅底紅字，達標綠字。',
  '日目標為月目標÷全月天數後無條件進位；達成率與得分不進位，剩餘日均需求另見公式明細。'
];
notes.push(`${sourceFile}｜月目標×100%／120%÷${kpi.meta.monthDays}天，日目標無條件進位。`);
notes.forEach((note,i)=>{const r=24+i; target.getRange(`A${r}:N${r}`).merge(); target.getRange(`A${r}`).values=[[note]]; target.getRange(`A${r}:N${r}`).format={font:{size:10,color:'#475569'},horizontalAlignment:'left',rowHeight:24};});
detail.getRange('E3:E101').format.numberFormat='0.0%'; detail.getRange('H3:H101').format.numberFormat='0%'; detail.getRange('I3:K101').format.numberFormat='#,##0.00';
detail.getRange('J3:J101').format.numberFormat='#,##0'; detail.getRange('A2:L101').format.borders={preset:'all',style:'thin',color:'#CBD5E1'};

// Keep source traceability in the main workbook.
const src=report.worksheets.getItem('資料來源');
const good=daily.meta.goodspeed;
src.getRange('A9:B11').values=[
  ['好速驗證',`公司正式實績${fmt(good.companyActual)}分／月目標${fmt(good.companyTarget)}分／達成率${(Number(good.companyRate)*100).toFixed(1)}%；企客、4G與BB加掛可認列，僅來源標記剔除${good.sourceExcludedCount}筆。`],
  ['締結率新版',`${closure.dates.join('、')}；最新 ${closure.latest.numerator}/${closure.latest.denominator}＝${(closure.latest.numerator/closure.latest.denominator*100).toFixed(1)}%。`],
  ['加減分日目標',`每店每項依當期進度採100%或120%，除以全月${kpi.meta.monthDays}日並ROUNDUP；區目標為9店進位後加總。`],
];
src.getRange('A9:B11').format={font:{size:10,color:'#0F172A'},wrapText:true,rowHeight:34};

repairSemanticFormats(report);
repairSemanticFormats(closureBook);
report.recalculate(); closureBook.recalculate();
await (await SpreadsheetFile.exportXlsx(report)).save(reportPath);
await (await SpreadsheetFile.exportXlsx(closureBook)).save(closurePath);
const checks=[];
checks.push((await report.inspect({kind:'table',sheetId:'締結率',range:`A2:K${closureLast}`,include:'values,formulas',tableMaxRows:60,tableMaxCols:11,maxChars:12000})).ndjson);
checks.push((await report.inspect({kind:'table',sheetId:'加減分日目標',range:'A2:N27',include:'values,formulas',tableMaxRows:28,tableMaxCols:14,maxChars:16000})).ndjson);
checks.push((await report.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:300},summary:'v4 formula error scan',maxChars:4000})).ndjson);
await fs.writeFile(path.join(out,'v4-verification.ndjson'),checks.join('\n'));

console.log(JSON.stringify({status:'WORKBOOK_BUILT',roster:kpi.persons.length}));
