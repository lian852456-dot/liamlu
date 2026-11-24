import { TEMPLATE_HASH } from './operations-brief-core.mjs?v=20261124-operations-review';
import {regionRatioChart,chartShape,writeRatioChart} from './operations-brief-chart.mjs?v=20261124-operations-review';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const TABLE = 'http://schemas.openxmlformats.org/drawingml/2006/table';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006';
const MIME = 'application/vnd.openxmlformats-officedocument';
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const FONT = 'Microsoft YaHei';
const LAYOUT_IDS = [1,2,3,4,19];
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const CY = 6858000;
const CX = 12192000;

const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function sha(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(hash,value=>value.toString(16).padStart(2,'0')).join('');
}
export async function openPackage(bytes, JSZip) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > 10000) throw Error('壓縮檔項目過多，請另存精簡版。');
  let total = 0;
  for (const file of entries) {
    const size = file._data?.uncompressedSize || 0;
    total += size;
    if (size > 128*1024*1024 || total > 512*1024*1024) throw Error('解壓後資料過大，請分檔。');
    if (/(?:^|\/)vbaProject\.bin$/i.test(file.name) || /activeX\//i.test(file.name)) throw Error('不支援含巨集或 ActiveX 的檔案，請另存無巨集版本。');
  }
  return zip;
}
async function xmlAt(zip,path) {
  const entry = zip.file(path);
  if (!entry) throw Error('原始範本缺少必要版面元件，請重新選取。');
  return entry.async('string');
}
async function loadTemplate(bytes, JSZip) {
  const hash = await sha(bytes);
  if (hash !== TEMPLATE_HASH) throw Error('請選原始15頁作戰範本 Y26XX作戰新創組(範例).pptx。其他版本先確認版面後才能支援。');
  const zip = await openPackage(bytes,JSZip);
  const slides = Object.keys(zip.files).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path)).length;
  const xml = await xmlAt(zip,'ppt/presentation.xml');
  if (slides !== 15 || !/<p:sldSz\b[^>]*cx="12192000"\s+cy="6858000"/.test(xml)) throw Error('原始範本頁數或尺寸不符。');
  return {zip, hash, slides};
}
export async function inspectTemplate(bytes, JSZip) {
  const {hash,slides} = await loadTemplate(bytes,JSZip);
  return {sha256:hash,slides,imagePages:[6,7,9,10,11,13],editableCharts:0,editableTables:0};
}
function runProperties(size,color,bold=false) {
  return `lang="zh-TW" sz="${size}" b="${bold?1:0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/><a:cs typeface="${FONT}"/>`;
}
function paragraphs(text,size,color,bold=false) {
  return String(text??'').split('\n').map(line => `<a:p><a:r><a:rPr ${runProperties(size,color,bold)}</a:rPr><a:t xml:space="preserve">${esc(line)}</a:t></a:r><a:endParaRPr lang="zh-TW" sz="${size}"/></a:p>`).join('');
}
function textShape(id,name,text,x,y,w,h,{size=1800,color='173C6A',bold=false,fill='',anchor='ctr'}={}) {
  const paint = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${paint}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="60000" tIns="35000" rIns="60000" bIns="35000" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs(text,size,color,bold)}</p:txBody></p:sp>`;
}
function nativeTable(id,rows,{widths,heights,x=530000,y=1680000,size=1400}) {
  const body = rows.map((row,ri) => {
    const fill = ri === 0 ? '173C6A' : ri%2 ? 'F0F5FA' : 'FFFFFF';
    const color = ri === 0 ? 'FFFFFF' : '173C6A';
    const cells = row.map(value => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(value==null||value===''?'待補':value,size,color,ri===0)}</a:txBody><a:tcPr marL="55000" marR="55000" marT="20000" marB="20000" anchor="ctr"><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`).join('');
    return `<a:tr h="${heights[ri]}">${cells}</a:tr>`;
  }).join('');
  const width = widths.reduce((sum,val)=>sum+val,0);
  const height = heights.reduce((sum,val)=>sum+val,0);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="可編輯來源表格"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></p:xfrm><a:graphic><a:graphicData uri="${TABLE}"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${widths.map(width=>`<a:gridCol w="${width}"/>`).join('')}</a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
function sourceFor(meta,item) {
  const file = meta.sourceFiles.find(source=>source.sha256 === item.sourceSha256 && source.name === item.sourceName && source.locators.includes(item.locator));
  if (!file) throw Error('簡報來源與核對結果不一致，請重新核對後產出。');
  return [file.name,(item.locators||[item.locator]).join('；'),item.sourcePeriod,item.sourceCoverage,`SHA ${file.sha256.slice(0,12)}`].filter(Boolean).join('｜');
}
function continueMark(frame) {
  frame.parts.push(textShape(frame.id++,'續頁提示','其餘內容見章節續頁',6660000,6240000,5050000,280000,{size:1150}));
}
function contentFrame(title,context) {
  const frame = { layout:4, parts:[], id:2 };
  frame.parts.push(textShape(frame.id++,'章節標題',title,1100000,280000,10600000,590000,{size:2920,bold:true}));
  if (context) frame.parts.push(textShape(frame.id++,'來源期間及範圍',context,560000,1000000,11100000,390000,{size:1450}));
  return frame;
}
function units(text) {
  return [...String(text)].reduce((total,character)=>total+(character.codePointAt(0)>255?1:0.58),0);
}
function lineCount(text,maxUnits) {
  return String(text).split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(units(line)/maxUnits)),0);
}
function noteFrames(meta,frames,title,context,items) {
  let y = 1560000;
  for (const item of items) {
    const frame = frames.at(-1);
    const reference = item.sourceSha256 ? '來源｜'+sourceFor(meta,item) : '';
    const height = Math.max(380000,lineCount(item.text,53)*240000+110000);
    const footHeight = reference ? Math.max(280000,lineCount(reference,101)*163000+90000) : 100000;
    if (y+height+footHeight > 6140000 && y > 1560000) {
      continueMark(frame);
      frames.push(contentFrame(title+'（續）',context));
      y = 1560000;
    }
    const current = frames.at(-1);
    current.parts.push(textShape(current.id++,item.label,item.label+'｜'+item.text,530000,y,11100000,height,
      {size:1750,fill:item.label==='分析建議'?'FFF1DD':'F0F5FA',anchor:'t'}));
    if (reference) current.parts.push(textShape(current.id++,'來源依據',reference,530000,y+height,11100000,footHeight,{size:1100,color:'47566D',anchor:'t'}));
    y += height+footHeight+95000;
  }
}
function tableFrames(meta,frames,title,context,tables) {
  for (const table of tables) {
    const reference = '來源｜'+sourceFor(meta,table);
    const size = table.headers.length > 7 ? 1200 : 1450;
    const baseWidth = Math.floor(11100000/table.headers.length);
    const widths = table.headers.map(()=>baseWidth);
    const charCapacity = Math.max(4,Math.floor((baseWidth-125000)/(size*127)));
    const height = row => Math.max(370000,Math.max(...row.map(val=>lineCount(val??'待補',charCapacity)))*(size*143)+95000);
    const headerHeight = height(table.headers);
    let cursor=0;
    while (cursor < table.rows.length) {
      let frame = frames.at(-1);
      if (frames.at(-1).hasTable) {
        continueMark(frame);
        frame = contentFrame(title+'（續）',context);
        frames.push(frame);
      }
      const from = cursor;
      const heights = [headerHeight];
      let occupied = headerHeight;
      while (cursor < table.rows.length) {
        const desired = height(table.rows[cursor]);
        if (desired+occupied>4300000 && cursor>from) break;
        heights.push(Math.min(desired,4300000-occupied));
        occupied += heights.at(-1);
        cursor++;
      }
      frame.parts.push(nativeTable(frame.id++,[table.headers,...table.rows.slice(from,cursor)],{widths,heights,size}));
      frame.parts.push(textShape(frame.id++,'表格來源依據',reference,530000,6060000,11100000,330000,{size:1100,color:'47566D'}));
      frame.hasTable = true;
    }
  }
}
function sectionFrames(meta,title,name,topic='',extra=[]) {
  const review = meta.sections[name];
  const match = item => (item.topic || '') === topic;
  const facts = (review?.facts || []).filter(match);
  const useful = [...facts.map(item=>({...item,label:'來源明確記載'})),
    ...(review?.recommendations || []).filter(match).map(item=>({...item,label:'分析建議'})),...extra];
  const tables = (review?.tables || []).filter(match);
  const period = [review?.period,review?.coverage].filter(Boolean).join('｜');
  const context = period.length > 156 ? '各來源期間與涵蓋範圍詳見下方來源標記。' : period;
  const frames = [contentFrame(title,context)];
  if (!facts.length && !tables.length) useful.unshift({label:'待核',text:'本頁尚缺已核對的當期來源。'});
  tableFrames(meta,frames,title,context,tables);
  if (useful.length && tables.length) {
    continueMark(frames.at(-1));
    frames.push(contentFrame(title+'（續）',context));
  }
  noteFrames(meta,frames,title,context,useful);
  for (const table of tables) {
    const chart = regionRatioChart(name,table);
    if (!chart) continue;
    continueMark(frames.at(-1));
    const frame = contentFrame(title+'｜'+chart.title,context);
    frame.chart = chart;
    frame.parts.push(chartShape(frame.id++));
    frame.parts.push(textShape(frame.id++,'圖表來源依據','來源｜'+sourceFor(meta,table),530000,6060000,11100000,330000,{size:1100,color:'47566D'}));
    frames.push(frame);
  }
  return frames;
}
function relationships(items) {
  return DECL+`<Relationships xmlns="${PKG}/relationships">${items.map(([id,type,target])=>`<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
}
function slideXml(frame,meta,page) {
  const pending = meta.status !== 'READY_VERIFIED';
  const colors = {size:1100,color:pending?'8C2323':'47566D',bold:pending,fill:pending?'FFF1DD':'EEF3F8'};
  const marker = pending ? '待核草稿' : '已完成來源核對';
  const footer = textShape(90001,'報告狀態',`${meta.periods.meeting}｜${marker}｜${page}`,8860000,6460000,3060000,315000,colors);
  // The cover artwork already includes the logo.
  const master = frame.layout===1?' showMasterSp="0"':'';
  return DECL+`<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"${master}><p:cSld><p:spTree>${GROUP}${frame.parts.join('')}${footer}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
const layoutPath = id => `ppt/slideLayouts/slideLayout${id}.xml`;
async function originalShapes(zip,page,ids) {
  const xml = await xmlAt(zip,`ppt/slides/slide${page}.xml`);
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  return ids.map(id => {
    const shape = shapes.find(piece=>piece.match(/<p:cNvPr id="([^"]+)"/)?.[1]===String(id));
    if (!shape) throw Error('原始範本章節版面缺失，請重新選取。');
    return shape;
  });
}
const coverAndDividers = async(zip,meta) => {
  const frames = new Map();
  const cover = await originalShapes(zip,1,[17410,17412]);
  cover[1] = cover[1].replace(/(<a:t[^>]*>)2026\.10(<\/a:t>)/,(_,open,close)=>open+meta.periods.meeting.replace('-','.')+close);
  frames.set(1,{layout:1,parts:cover});
  for (const [page,id,layout] of [[2,2,3],[5,2,3],[8,5,3],[12,4,3],[14,2,2]]) frames.set(page,{layout,parts:await originalShapes(zip,page,[id])});
  return frames;
};
async function writeTemplateStyle(source,zip) {
  // Only the authenticated template's reusable design parts may travel into the new package.
  const media = ['ppt/media/image1.png','ppt/media/image2.jpeg'];
  for (const path of [...media,'ppt/theme/theme1.xml']) {
    const entry = source.file(path);
    if (!entry) throw Error('無法保留原始範本的 LOGO 或封面，請重新選取範本。');
    zip.file(path,await entry.async('uint8array'));
  }
  const masterPath = 'ppt/slideMasters/slideMaster1.xml';
  const master = await xmlAt(source,masterPath);
  const logo = master.match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0];
  if (!logo?.includes('r:embed="rId21"')) throw Error('原始範本的 LOGO 無法對應。');
  const layoutList = LAYOUT_IDS.map(id=>`<p:sldLayoutId id="${2147483648+id}" r:id="rId${id}"/>`).join('');
  zip.file(masterPath,master.replace(/<p:spTree>[\s\S]*?<\/p:spTree>/,`<p:spTree>${GROUP}${logo}</p:spTree>`).replace(/<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>/,`<p:sldLayoutIdLst>${layoutList}</p:sldLayoutIdLst>`));
  const masters = LAYOUT_IDS.map(id=>[`rId${id}`,'slideLayout',`../slideLayouts/slideLayout${id}.xml`]);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels',relationships([...masters,['rId20','theme','../theme/theme1.xml'],['rId21','image','../media/image1.png']]));
  for (const id of LAYOUT_IDS) {
    const path = layoutPath(id);
    zip.file(path,await xmlAt(source,path));
    const links = [['rId1','slideMaster','../slideMasters/slideMaster1.xml']];
    if (id===1) links.push(['rId2','image','../media/image2.jpeg']);
    zip.file(`ppt/slideLayouts/_rels/slideLayout${id}.xml.rels`,relationships(links));
  }
}
async function writePresentation(zip,slides,meta,JSZip) {
  const defaultType = (extension,type) => `<Default Extension="${extension}" ContentType="${type}"/>`;
  const override = (part,type) => `<Override PartName="/${part}" ContentType="${MIME}.${type}+xml"/>`;
  const links = [['rId1','slideMaster','slideMasters/slideMaster1.xml']];
  const defaults = [
    defaultType('jpeg','image/jpeg'), defaultType('png','image/png'), defaultType('xml','application/xml'),
    defaultType('rels','application/vnd.openxmlformats-package.relationships+xml'), defaultType('xlsx',MIME+'.spreadsheetml.sheet')
  ];
  const overrides = [override('ppt/presentation.xml','presentationml.presentation.main'),override('ppt/theme/theme1.xml','theme'),
    override('ppt/slideMasters/slideMaster1.xml','presentationml.slideMaster'),...LAYOUT_IDS.map(id=>override(layoutPath(id),'presentationml.slideLayout'))];
  const slideIds = [];
  for (const [index,frame] of slides.entries()) {
    const page = index+1;
    const path = `ppt/slides/slide${page}.xml`;
    const slideLinks = [['rId1','slideLayout',`../slideLayouts/slideLayout${frame.layout}.xml`]];
    if (frame.chart) {
      const chartPath = await writeRatioChart(zip,JSZip,page,frame.chart);
      overrides.push(override(chartPath,'drawingml.chart'));
      slideLinks.push(['rIdOperationsChart','chart','../'+chartPath.replace(/^ppt\//,'')]);
    }
    zip.file(path,slideXml(frame,meta,page));
    zip.file(`ppt/slides/_rels/slide${page}.xml.rels`,relationships(slideLinks));
    overrides.push(override(path,'presentationml.slide'));
    links.push([`rIdSlide${page}`,'slide',`slides/slide${page}.xml`]);
    slideIds.push(`<p:sldId id="${255+page}" r:id="rIdSlide${page}"/>`);
  }
  zip.file('[Content_Types].xml',DECL+`<Types xmlns="${PKG}/content-types">${defaults.join('')}${overrides.join('')}</Types>`);
  zip.file('_rels/.rels',relationships([['rId1','officeDocument','ppt/presentation.xml']]));
  zip.file('ppt/_rels/presentation.xml.rels',relationships(links));
  zip.file('ppt/presentation.xml',DECL+`<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483743" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds.join('')}</p:sldIdLst><p:sldSz cx="${CX}" cy="${CY}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
}
function goodSpeedFrames(meta) {
  const names = ['好速','好速長約','好速失敗原因'];
  const main = contentFrame('好速表現與失敗分類','各項依所列來源及期間核對，無紀錄保留缺值。');
  main.parts.push(nativeTable(main.id++,[
    ['章節','來源期間','範圍','狀態'],
    ...names.map(name=>[name,meta.sections[name]?.period,meta.sections[name]?.coverage,meta.sections[name]?.status==='verified'?'已核對':'待核'])
  ],{widths:[2400000,3500000,3000000,2200000],heights:[475000,580000,580000,580000],size:1550}));
  main.parts.push(textShape(main.id++,'好速口徑','企客4G納入，正式剔除／降轉依來源標記。\n36M占比使用來源12／24／36M合計，0.5點由來源認列。\n失敗原因只用標準分類，取消V另列，未列紀錄不推為零。',530000,4160000,11100000,1660000,{size:1620,fill:'F0F5FA'}));
  const continuations = names.flatMap(name => {
    const section = meta.sections[name];
    if (!section?.facts.length&&!section?.recommendations.length&&!section?.tables.length) return [];
    return sectionFrames(meta,name,name);
  });
  return [main,...continuations];
}
export async function buildDraft(bytes,meta,JSZip) {
  if (meta.contract !== 'operations-local-brief-v2' || !['DRAFT_UNMAPPED','READY_VERIFIED'].includes(meta.status)
    || meta.templateHash !== TEMPLATE_HASH || (meta.status==='READY_VERIFIED' && meta.unresolved.length)) {
    throw Error('匯出前請重新讀取範本並核對來源狀態。');
  }
  const {zip:original}=await loadTemplate(bytes,JSZip);
  const zip=new JSZip();
  const fixed = await coverAndDividers(original,meta);
  const pages = new Map([
    [3,sectionFrames(meta,'店務｜近半年成績','店務')],
    [4,sectionFrames(meta,'店務｜當月未滿分及缺失','店務','storeDeficiencies')],
    [6,sectionFrames(meta,'舊換新｜回收／Device 表現','舊換新')],
    [7,sectionFrames(meta,'舊換新｜當期政策','舊換新','tradeinPolicy')],
    [9,sectionFrames(meta,'復原者｜當期政策','新復原者／保險','insurancePolicy')],
    [10,sectionFrames(meta,'保險｜本期及比較期搭售','新復原者／保險','insurancePerformance')],
    [11,sectionFrames(meta,'保險｜當期方案比較','新復原者／保險','insuranceComparison')],
    [13,sectionFrames(meta,'部區金牌｜近三月淨金牌','金牌')],
    [15,sectionFrames(meta,'本月重點與行銷行動','行銷簡報','',meta.highlights ? [{label:'督導會議重點',text:meta.highlights}] : [])],
    [16,goodSpeedFrames(meta)]
  ]);
  const main = Array.from({length:16},(_,i)=>fixed.get(i+1) || pages.get(i+1)[0]);
  const continuation = [...pages.values()].flatMap(frames=>frames.slice(1));
  if (continuation.length>200) throw Error('本次追加內容超過200頁，請先彙總來源後再匯出。');
  await writeTemplateStyle(original,zip);
  await writePresentation(zip,[...main,...continuation],meta,JSZip);
  return zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
}
