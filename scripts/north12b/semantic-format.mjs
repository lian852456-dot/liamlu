import {comparison} from './dod.mjs';
// 2026-09-09 bounded repair: semantic styles and approved DOD display formulas.
const F='Noto Sans TC', navy='#17365D', yellow='#FFCF17';
const SOURCE_FILE=process.env.SOURCE_FILE ?? '來源檔';
const PREVIOUS_SOURCE_FILE=process.env.PREVIOUS_SOURCE_FILE ?? '前次來源';
const QIS_CUTOFF=process.env.QIS_CUTOFF ?? '待確認';
const INSURANCE_CUTOFF=process.env.INSURANCE_CUTOFF ?? '待確認';
const PREVIOUS_INSURANCE_CUTOFF=process.env.PREVIOUS_INSURANCE_CUTOFF ?? '待確認';
const HAS_INSURANCE=!['','待確認','null','none','尚未有資料'].includes(String(INSURANCE_CUTOFF).toLowerCase());
const HAS_QIS=!['','待確認','null','none','尚未有資料'].includes(String(QIS_CUTOFF).toLowerCase());
export const renderOptions={headers:false,format:'png'};
function threshold(range,n,positiveFill='#F8FAFC') {
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add('cellIs',{operator:'lessThan',formula:n,format:{fill:'#FEE2E2',font:{color:'#DC2626',bold:true}}});
  range.conditionalFormats.add('cellIs',{operator:'greaterThanOrEqual',formula:n,format:{fill:positiveFill,font:{color:'#059669',bold:true}}});
}
function delta(range) {
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add('cellIs',{operator:'lessThan',formula:0,format:{fill:'#FEE2E2',font:{color:'#DC2626',bold:true}}});
  range.conditionalFormats.add('cellIs',{operator:'greaterThan',formula:0,format:{fill:'#DCFCE7',font:{color:'#059669',bold:true}}});
}
export function repairSemanticFormats(book) {
 const audit=[];
 // Exact legacy ranges must be removed: deleteAll on a larger enclosing range
 // does not delete rules registered against smaller/different ranges.
 const legacy={
 '主力KPI':['D4:D13','G4:G13','I4:V13','F4:F13','H4:H13'],
 '加掛得分':['D4:D13','H4:R13','G4:G13','E4:F13'],
 '手機保險':['D5:D14','G5:G14','C5:C14','F5:F14','B3:C12','E3:F12','D3:D12','G3:G12'],
 'QIS店績':['B5:B14','F5:F14','B3:B12','F3:F12'],
 '締結率':['E5:E14','K4:K13'],'締結率近三日':['E5:E14','K4:K13']};
 for(const [name,ranges] of Object.entries(legacy)) {
  const sheet=book.worksheets.items.find(x=>x.name===name);
  if(sheet)for(const range of ranges)sheet.getRange(range).conditionalFormats.deleteAll();
 }
 for(const name of ['締結率','締結率近三日']) {
  const s=book.worksheets.items.find(x=>x.name===name);if(!s)continue;
  s.getUsedRange().conditionalFormats.deleteAll();
  for(let r=4;r<=13;r++)s.getRange(`B${r}:K${r}`).format.fill=r===4?'#FFF4C2':r%2?'#F8FAFC':'#FFFFFF';
  delta(s.getRange('K4:K13'));
 }
 for(const name of ['主力KPI','加掛得分','手機保險','QIS店績','好速上線明細']) {
  const s=book.worksheets.items.find(x=>x.name===name); if(!s)continue;
  const width={'主力KPI':'V','加掛得分':'R','手機保險':'I','QIS店績':'F','好速上線明細':'O'}[name];
  const vals=s.getRange(`A1:${width}100`).values;
  const h=vals.findIndex(r=>r.includes('店點')&&(r.includes('KPI')||r.includes('認列狀態')||r.some(v=>String(v??'').includes('達成率'))))+1;
  if(!h)throw Error(`HEADER_NOT_FOUND ${name}`);
  const first=h+1;let end=first;
  while(end<=vals.length && vals[end-1]?.some(v=>v!==null&&v!==''&&v!==undefined)) {
   if(end>first&&String(vals[end-1][0]??'').startsWith('來源'))break;
   end++;
  }
  end--;
  const aggregate=vals.findIndex(r=>r.some(v=>v==='北一二B整體'))+1;
  s.getRange(`A${h}:${width}${end}`).conditionalFormats.deleteAll();
  for(let r=first;r<=end;r++) {
   s.getRange(`A${r}:${width}${r}`).format={fill:r===aggregate?'#FFF4C2':(r-first)%2?'#FFFFFF':'#F8FAFC',font:{size:name==='主力KPI'||name==='加掛得分'?10:11,bold:r===aggregate,color:'#0F172A'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:30,borders:{preset:'all',style:'thin',color:'#CBD5E1'}};
  }
  s.getRange(`A${h}:${width}${h}`).format={fill:yellow,font:{bold:true,size:11,color:navy},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:48,borders:{preset:'all',style:'thin',color:'#CBD5E1'}};
  const group=(a,b,fill)=>s.getRange(`${a}${h}:${b}${h}`).format={fill,font:{bold:true,color:'#FFFFFF',size:10}};
  if(name==='主力KPI') {
   group('A','D','#142F60'); group('E','H','#7C3AED');group('I','M','#142F60');group('N','O','#2563EB');group('P','S','#142F60');group('T','U','#059669');group('V','V','#D97706');
   for(const a of ['D','G'])threshold(s.getRange(`${a}${first}:${a}${end}`),1);
   threshold(s.getRange(`I${first}:V${end}`),1);delta(s.getRange(`F${first}:F${end}`));delta(s.getRange(`H${first}:H${end}`));
  } else if(name==='加掛得分') {
   group('A','D','#142F60');group('E','G','#7C3AED');
   threshold(s.getRange(`E${first}:F${end}`),15,'#DCFCE7');delta(s.getRange(`G${first}:G${end}`));threshold(s.getRange(`D${first}:D${end}`),1);threshold(s.getRange(`H${first}:R${end}`),1);
  } else if(name==='手機保險') {
   {threshold(s.getRange(`B${first}:C${end}`),1);threshold(s.getRange(`E${first}:F${end}`),0.5);delta(s.getRange(`D${first}:D${end}`));delta(s.getRange(`G${first}:G${end}`));}
  } else if(name==='QIS店績') {
   threshold(s.getRange(`B${first}:B${end}`),1);
   // Preserve the existing QIS warning threshold, not the obsolete shifted rules.
   threshold(s.getRange(`F${first}:F${end}`),98);
  } else {
   for(let r=first;r<=end;r++)s.getRange(`D${r}`).format={fill:String(vals[r-1][3]).startsWith('認列')?'#DCFCE7':'#FEE2E2',font:{bold:true,color:String(vals[r-1][3]).startsWith('認列')?'#166534':'#DC2626'}};
  }
  // Remove visual residue in the empty spacer, retaining all populated rows.
  if(!vals[end]?.some(v=>v!==null&&v!==''&&v!==undefined))
   s.getRange(`A${end+1}:${width}${end+1}`).format={fill:'#FFFFFF',rowHeight:8,font:{color:'#0F172A',bold:false}};
  if(name==='好速上線明細') {
   s.getRange('N1:O2').unmerge();s.getRange('N1:O2').clear({applyTo:'all'});
   s.getRange('A1:M1').unmerge();s.getRange('A1:O1').merge();
   const existingBonus=vals.findIndex(row=>String(row[0]??'').startsWith('戰報加碼（自08/27'))+1;
   const note=existingBonus||Math.max(end+4,vals.findLastIndex(row=>row.some(v=>v!==null&&v!==''&&v!==undefined))+2);
   s.getRange(`A${note}:O${note}`).merge();
   s.getRange(`A${note}`).values=[['戰報加碼（自08/27戰報起）：36M +0.5；1G／500M +0.5；另列，不回灌公司KPI。']];
   s.getRange(`A${note}:O${note}`).format={fill:'#EFF6FF',font:{size:10,color:navy},rowHeight:30,wrapText:true};
  }
  s.showGridLines=false;s.freezePanes.freezeRows(h);
  audit.push({sheet:name,header:h,dataStart:first,dataEnd:end,aggregate});
 }
 repairMeaning(book);
 return audit;
}

// Source-confirmed presentation semantics. Company KPI values are not recomputed.
function repairMeaning(book) {
 const get=n=>book.worksheets.items.find(s=>s.name===n);
 const notes=get('資料來源');
 if(notes){const v=notes.getUsedRange().values;for(let r=0;r<v.length;r++)for(let c=0;c<v[r].length;c++)if(typeof v[r][c]==='string'&&v[r][c].includes('手機保險以前日截至'))notes.getRange(`${String.fromCharCode(65+c)}${r+1}`).values=[[v[r][c].replace(/手機保險以前日截至.*?計算DOD/,`手機保險依前次截至${PREVIOUS_INSURANCE_CUTOFF}／本次截至${INSURANCE_CUTOFF}來源原值計算DOD`)]];}
 let s=get('主力KPI');
 if(s){s.getRange('M2').values=[['共同督導績\nNP OUT']];s.getRange('M3').values=[['來源未提供']];s.getRange('M3').format.font={size:9,color:'#475569'};}
 s=get('QIS店績');
 if(s){s.getRange('B2:F2').values=[['達成率\n整體：9店平均','計件數\n（整體加總）','服務態度\n（整體店均）','專業能力\n（整體店均）','原始分數\n整體：來源平均']];s.getRange('A2:F2').format.rowHeight=58;s.getRange('A14').values=[[s.getRange('C3').values[0][0] !== '尚未有資料'?`來源：${SOURCE_FILE} QIS店績，截至${QIS_CUTOFF}；整體達成率為9店算術平均，非公司正式區達成率；原始平均分數取F13。`:`來源：${SOURCE_FILE}｜QIS尚未有資料；保留null、未補0、未沿用前月。`]];s.getRange('A14:F14').format={wrapText:true,rowHeight:42,font:{size:10}};}
 s=get('手機保險');
 if(s){
  s.getRange('B2:G2').values=[[`前次\n來源進度達成率`,`本次\n來源進度達成率`,'DOD\n（百分點）',`前次\n來源搭售率`,`本次\n來源搭售率`,'DOD\n（百分點）']];
  s.getRange('A2:I2').format.rowHeight=62;
  {
   for(let r=3;r<=12;r++){
    // Source rates have five decimal places. Integer subtraction avoids binary ties.
    for(const [out,a,b] of [['D','C','B'],['G','F','E']]){
     const d=`(ROUND(${a}${r}*100000,0)-ROUND(${b}${r}*100000,0))`;
     const current=s.getRange(`${a}${r}`).values[0][0], previous=s.getRange(`${b}${r}`).values[0][0];
     const sameMonth=process.env.INSURANCE_DOD_SAME_MONTH==='true';
     if(comparison(current,previous,sameMonth).value!==null) s.getRange(`${out}${r}`).formulas=[[`=SIGN(${d})*INT((ABS(${d})+50)/100)/10`]];
     else s.getRange(`${out}${r}`).values=[['暫不比較']];
    }
   }
   for(const c of ['D','G'])s.getRange(`${c}3:${c}12`).format.numberFormat='+0.0"pp";-0.0"pp";0.0"pp"';
  }
  s.getRange('A14').values=[[`前次${PREVIOUS_SOURCE_FILE}（截至${PREVIOUS_INSURANCE_CUTOFF}）／本次${SOURCE_FILE}（截至${INSURANCE_CUTOFF}）。前日無資料、跨月或截止日待確認：DOD暫不比較；今日來源有值照常顯示，缺值為尚未有資料。`]];
  s.getRange('A14:I14').format={wrapText:true,rowHeight:44,font:{size:10}};
 }
 s=get('好速上線明細');
 if(s){s.getRange('K3:M60').format.numberFormat='0.00';s.getRange('L2:M2').values=[['當日公司\n認列點數','當日戰報\n含另加點數']];}
}
