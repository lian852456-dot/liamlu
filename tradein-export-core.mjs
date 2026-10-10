// Export only the already authorized, de-identified projection. No raw trade data.
export const DEFAULT_RULES = Object.freeze({month:'2026-10',start:'2026-10-01',end:'2026-10-31',periodStatus:'confirmed',cadence:'monthly',sourceStart:'2026-10-01',sourceEnd:'2026-10-07',cutoff:'2026-10-07',timezone:'Asia/Taipei',staffTarget:3,actingManager:'exempt',isDemo:true});
export function isDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function rulesForMonth(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||Number(month.slice(0,4))<1900)throw new Error('請選擇有效月份。');
  const [year,number]=month.split('-').map(Number);
  return Object.freeze({...DEFAULT_RULES,month,start:month+'-01',end:new Date(Date.UTC(year,number,0)).toISOString().slice(0,10)});
}
export function hasMonthlySource(rules){return rules.start<=rules.sourceStart&&rules.end>=rules.sourceEnd;}
export function formatDifference(actual,target){
  if(target===null)return '不適用';
  if(actual===null)return '待核';
  const difference=actual-target;
  return (difference>0?'+':difference<0?'−':'')+Math.abs(difference)+' 台';
}
export function formatRecoveredModels(actual,models){
  if(actual===0)return '尚無回收';
  if(!Array.isArray(models))return actual===null?'待核':'機款待補';
  return models.map(m=>m.model+(m.units>1?' × '+m.units:'')).join('、');
}
export function describePerson(person,rules=DEFAULT_RULES){
  const [store,name,role,raw,recoveredModels=null]=person;
  if(raw!==null&&(!Number.isSafeInteger(raw)||raw<0))throw new Error('實績型別或數值無效，停止匯出。');
  const actual=hasMonthlySource(rules)?raw:null;
  const exempt=role==='免目標'||role==='店長'||role==='代理店長'&&rules.actingManager==='exempt';
  const target=role==='同仁'?rules.staffTarget:null;
  const remaining=target!==null&&actual!==null?Math.max(0,target-actual):null;
  const status=exempt?'不設目標':role!=='同仁'?'未知（身份／職務待核）':actual===null?'未知（實績未提供）':actual>=target?(rules.isDemo?'示意達標':'已達標'):(rules.isDemo?'示意進行中':'進行中');
  const missing=!hasMonthlySource(rules)?'選定月份來源未提供':'實績未提供';
  const reason=exempt?(role==='免目標'?'不設目標':role+'免目標')+(actual===null?'；'+missing:''):role!=='同仁'?'身份／職務待確認':actual===null?missing+'；每月 3 台':(rules.isDemo?'每月 3 台；實績為示意':'每月 3 台；單銷計入，含取消交易待核');
  return Object.freeze({store:String(store),name:String(name),role:String(role),actual,target,remaining,status,reason,recoveredModels});
}
export function buildExportModel(context,scope,rules=DEFAULT_RULES){
  if(!context||!context.active)throw new Error('請先完成登入並讀取資料。');
  if(!['self','current','all'].includes(scope))throw new Error('匯出範圍無效。');
  if(!['supervisor','public'].includes(context.mode)&&scope!=='self')throw new Error('此角色只能匯出本人。');
  const monthRules=rulesForMonth(rules.month);
  if(![rules.start,rules.end,rules.sourceStart,rules.sourceEnd,rules.cutoff].every(isDate)||rules.start!==monthRules.start||rules.end!==monthRules.end||rules.sourceStart>rules.sourceEnd||rules.cutoff!==rules.sourceEnd)throw new Error('本期須為選定月份的完整日曆月，來源日期須有效。');
  if(rules.staffTarget!==3||rules.actingManager!=='exempt'||rules.cadence!=='monthly'||rules.periodStatus!=='confirmed')throw new Error('已核定每月 3 台，店長與代理店長免目標。');
  let rows;
  let scopeLabel;
  if(scope==='self'){
    if(!context.self)throw new Error('沒有已授權的本人資料。');
    rows=[context.self];scopeLabel='本人 · '+context.self[1];
  }else{
    const allowed=new Set(context.allowedStores||[]);
    const store=scope==='current'?context.selectedStore:'';
    if(store&&!allowed.has(store))throw new Error('此店點不在目前授權範圍。');
    rows=(scope==='current'&&Array.isArray(context.currentPeople)?context.currentPeople:context.people).filter(p=>allowed.has(p[0])&&(!store||p[0]===store));
    scopeLabel=context.mode==='public'?(store?store+' · 公開進度':'全區九店 · 公開進度'):(store?store+' · 已授權'+(rules.isDemo?'示意':''):'全部已授權店點'+(rules.isDemo?' · 示意':''));
    if(scope==='current'&&context.countFilterLabel)scopeLabel+=' · '+context.countFilterLabel;
  }
  if(!rows.length)throw new Error('此範圍沒有可匯出的資料。');
  if(rows.length>100)throw new Error('資料超過 100 人，請縮小匯出範圍。');
  return Object.freeze({title:'舊換新個人提醒',scopeLabel,showDifference:context.mode==='public',rules:Object.freeze({...rules}),rows:Object.freeze(rows.map(p=>describePerson(p,rules)))});
}
export function reminderText(model){
  const r=model.rules;
  return [(r.isDemo?'【舊換新提醒｜全為示意資料】':'【舊換新每月進度提醒】'),`月份：${r.month}｜本期 ${r.start}–${r.end}（每月 3 台）`,`來源期間：${r.sourceStart}–${r.sourceEnd}`,`來源截止：${r.cutoff}（日期精度；${r.timezone}）`,...(r.statusAsOf?[`取消狀態核對至：${r.statusAsOf}（含取消交易停止同步，沖回月份待核）`]:[]),`月份資料：${hasMonthlySource(r)?(r.isDemo?'選定月份截至來源截止的累積有效交易示意；未核涵蓋仍為未知':'選定月份截至報表查詢截止的有效回收；日期精度不代表當日終日'):'選定月份尚未提供來源；其他月份實績不納入'}`,`匯出範圍：${model.scopeLabel}`,'',...model.rows.flatMap(p=>[
    `${p.store}｜${p.name}｜${p.role}`,
    `實績：${p.actual===null?'未提供':p.actual+' 台'}；目標：${p.target===null?(p.status==='不設目標'?'不設目標':'身份待核'):p.target+' 台／月'}；${model.showDifference?'目前差異：'+formatDifference(p.actual,p.target):'尚缺：'+(p.remaining===null?'未判定':p.remaining+' 台'+(r.isDemo?'（示意）':''))}`,
    model.showDifference?`回收機款：${formatRecoveredModels(p.actual,p.recoveredModels)}`:`狀態：${p.status}；${p.reason}`,''
  ]),...(model.showDifference?['目前差異＝實績－月目標；負數為未達，正數為超標。']:[]),'未知值不當成 0；超標台數不能替其他同仁達標。'].join('\n');
}
export function workbookRows(model){
  const r=model.rules;
  return [[],[r.isDemo?'舊換新進度｜合成示意':'舊換新每月個人進度'],[r.isDemo?'規則已核定：每月 3 台；店長與代理店長免目標。人員與實績仍為合成示意。':'每月 3 台；店長與代理店長免目標。單銷計入；含取消交易停止同步，沖回月份待核。'],[],
    ['選定月開始',{date:r.start}],['選定月結束',{date:r.end}],['來源期間開始',{date:r.sourceStart}],['來源期間結束',{date:r.sourceEnd}],['來源截止',{date:r.cutoff}],['規則狀態','每月 3 台；店長與代理店長免目標'+(r.statusAsOf?'；取消狀態核對至 '+r.statusAsOf:'')],['匯出範圍',model.scopeLabel],['月份／缺值',r.month+'；'+r.timezone+'；'+(hasMonthlySource(r)?'截至來源截止；未知數值留空':'選定月份來源未提供；實績留空')],[],
    ['店點','人員','職務','實績（台）','目標（台）',model.showDifference?'目前差異（實績－月目標）':'尚缺（台）',model.showDifference?'回收機款':'達標／未知狀態','目標／資料狀態'],
    ...model.rows.map(p=>[p.store,p.name,p.role,p.actual,p.target,model.showDifference?(p.actual===null||p.target===null?null:p.actual-p.target):p.remaining,model.showDifference?formatRecoveredModels(p.actual,p.recoveredModels):p.status,p.reason])];
}
const xml=value=>String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const excelDate=iso=>(Date.parse(iso+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
const visualWidth=value=>Array.from(String(value)).reduce((n,c)=>n+(c.codePointAt(0)>255?2:1),0);
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function zip(files){
  const encoder=new TextEncoder(),local=[],central=[];let offset=0;
  for(const [name,body] of files){
    const n=encoder.encode(name),b=encoder.encode(body),crc=crc32(b),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,n.length,true);h.set(n,30);
    const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,b.length,true);cv.setUint32(24,b.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);
    local.push(h,b);central.push(c);offset+=h.length+b.length;
  }
  const cd=concat(central),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cd.length,true);e.setUint32(16,offset,true);
  return concat([...local,cd,end]);
}
export function createXlsx(model){
  const rows=workbookRows(model),widths=[18,32,17,14,14,14,29,35];
  const rowXml=rows.map((row,i)=>{
    const num=i+1,table=num>=15,header=num===14;
    const height=table?Math.max(30,...row.map((value,col)=>value===null||typeof value!=='string'?30:Math.ceil(visualWidth(value)/(widths[col]-5))*17+10)):num===3?30:num===2?26:25;
    const cells=row.map((value,col)=>{
      if(value===null||value===undefined)return '';
      const ref=String.fromCharCode(65+col)+num;
      if(typeof value==='number'){const difference=model.showDifference&&table&&col===5;if(!Number.isSafeInteger(value)||value<0&&!difference)throw new Error('匯出含有不正確數值。');return `<c r="${ref}" s="${difference?6:3}" t="n"><v>${value}</v></c>`;}
      if(value&&typeof value==='object'&&value.date){if(!isDate(value.date))throw new Error('匯出日期無效。');return `<c r="${ref}" s="4" t="n"><v>${excelDate(value.date)}</v></c>`;}
      const style=header?2:num===2?1:num===3?5:0;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${num}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join('');
  const head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files=[
    ['[Content_Types].xml',head+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels',head+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',head+`<workbook xmlns="${main}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets><sheet name="舊換新進度" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',head+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',head+`<styleSheet xmlns="${main}"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="+0;-0;0"/></numFmts><fonts count="3"><font><sz val="11"/><color rgb="FF273746"/><name val="Arial"/></font><font><b/><sz val="15"/><color rgb="FF273746"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF8C421C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml',head+`<worksheet xmlns="${main}"><dimension ref="A1:H${rows.length}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="14" topLeftCell="A15" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="25"/><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A14:H${rows.length}"/><mergeCells count="6"><mergeCell ref="A2:H2"/><mergeCell ref="A3:H3"/><mergeCell ref="B10:H10"/><mergeCell ref="B11:H11"/><mergeCell ref="B12:H12"/><mergeCell ref="B4:H4"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`]
  ];
  return zip(files);
}
export function wrapText(ctx,text,maxWidth){
  const lines=[];
  for(const paragraph of String(text).split('\n')){
    let line='';for(const char of Array.from(paragraph)){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line=char;}else line+=char;}lines.push(line);
  }
  return lines;
}
export function createReminderCanvas(model){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('此瀏覽器無法產生圖片。');
  const width=900,pad=44,content=width-pad*2;
  const lines=reminderText(model).split('\n'),layout=[];let height=36;
  for(let i=0;i<lines.length;i++){
    const title=i===0,size=title?29:19;
    ctx.font=`${title||model.showDifference?'700':'500'} ${size}px system-ui,"PingFang TC","Microsoft JhengHei",sans-serif`;
    const wrapped=wrapText(ctx,lines[i],content),step=title?42:29;
    for(const text of wrapped){layout.push({text,y:height+size,size,title});height+=step;}
    if(i===0)height+=16;
  }
  height+=40;
  if(height>16000)throw new Error('圖片內容太長，請縮小匯出範圍。');
  canvas.width=width*2;canvas.height=height*2;ctx.scale(2,2);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#fff0e6';ctx.fillRect(0,0,width,108);
  for(const line of layout){ctx.font=`${line.title||model.showDifference?'700':'500'} ${line.size}px system-ui,"PingFang TC","Microsoft JhengHei",sans-serif`;ctx.fillStyle=line.title?'#a44a17':'#273746';ctx.fillText(line.text,pad,line.y);}
  return {canvas,layout,width,height};
}
