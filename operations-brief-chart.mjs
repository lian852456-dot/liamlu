// Reviewed region ratios only. The chart and its editable workbook share the exact same rows.
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const MIME = 'application/vnd.openxmlformats-officedocument';
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const labels = {
  '舊換新': ['比率'],
  '好速': ['實績／目標','點數／目標'],
  '好速長約': ['36M占比']
};
const esc = text => String(text).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));

export function regionRatioChart(section,table) {
  const regionColumn = table.headers.indexOf('督導區');
  const ratioColumn = table.headers.findIndex(header=>(labels[section] || []).includes(header));
  if (regionColumn < 0 || ratioColumn < 0 || table.rows.length < 2 || table.rows.length > 4) return null;
  const rows = table.rows.map(row=>{
    const label = row[regionColumn];
    const match = String(row[ratioColumn]??'').match(/^(\d+(?:\.\d+)?)%$/);
    return {label,value:match ? Number(match[1])/100 : null};
  });
  if (new Set(rows.map(row=>row.label)).size !== rows.length
    || rows.some(row=>!/^北一二\s*[ABCD]$/.test(row.label||'') || !Number.isFinite(row.value))) return null;
  return {title:table.headers[ratioColumn],rows};
}
export function chartShape(id) {
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="可編輯區域指標圖表"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="600000" y="1560000"/><a:ext cx="10900000" cy="4260000"/></p:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" r:id="rIdOperationsChart"/></a:graphicData></a:graphic></p:graphicFrame>`;
}
function axis(id,cross,position,isValue) {
  const type = isValue ? 'valAx' : 'catAx';
  const end = isValue ? '<c:crossBetween val="between"/>' : '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>';
  return `<c:${type}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${isValue?'<c:majorGridlines/><c:numFmt formatCode="0%" sourceLinked="0"/>':''}<c:majorTickMark val="out"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${end}</c:${type}>`;
}
function chartXml(chart) {
  const points = property => chart.rows.map((row,index)=>`<c:pt idx="${index}"><c:v>${esc(row[property])}</c:v></c:pt>`).join('');
  const count = `<c:ptCount val="${chart.rows.length}"/>`;
  const last = chart.rows.length+1;
  const category = `<c:cat><c:strRef><c:f>Summary!$A$2:$A$${last}</c:f><c:strCache>${count}${points('label')}</c:strCache></c:strRef></c:cat>`;
  const values = `<c:val><c:numRef><c:f>Summary!$B$2:$B$${last}</c:f><c:numCache><c:formatCode>0.0%</c:formatCode>${count}${points('value')}</c:numCache></c:numRef></c:val>`;
  const series = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Summary!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(chart.title)}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="E66916"/></a:solidFill></c:spPr>${category}${values}</c:ser>`;
  return DECL+`<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="85"/><c:axId val="1400"/><c:axId val="1401"/></c:barChart>${axis(1400,1401,'b',false)}${axis(1401,1400,'l',true)}</c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}
function workbookRelationship(type,target) {
  return DECL+`<Relationships xmlns="${PKG}/relationships"><Relationship Id="rId1" Type="${R}/${type}" Target="${target}"/></Relationships>`;
}
async function chartWorkbook(JSZip,chart) {
  const book = new JSZip();
  const cell = (column,index,text)=>`<c r="${column}${index}" t="inlineStr"><is><t>${esc(text)}</t></is></c>`;
  const rows = chart.rows.map((row,index)=>{
    const n=index+2;
    return `<row r="${n}">${cell('A',n,row.label)}<c r="B${n}"><v>${row.value}</v></c></row>`;
  }).join('');
  book.file('[Content_Types].xml',DECL+`<Types xmlns="${PKG}/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="${MIME}.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${MIME}.spreadsheetml.worksheet+xml"/></Types>`);
  book.file('_rels/.rels',workbookRelationship('officeDocument','xl/workbook.xml'));
  book.file('xl/workbook.xml',DECL+`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  book.file('xl/_rels/workbook.xml.rels',workbookRelationship('worksheet','worksheets/sheet1.xml'));
  book.file('xl/worksheets/sheet1.xml',DECL+`<worksheet xmlns="${S}"><sheetData><row r="1">${cell('A',1,'督導區')}${cell('B',1,chart.title)}</row>${rows}</sheetData></worksheet>`);
  return book.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
export async function writeRatioChart(zip,JSZip,index,chart) {
  const name = `region-ratio-${index}`;
  const chartPath = `ppt/charts/${name}.xml`;
  zip.file(chartPath,chartXml(chart));
  zip.file(`ppt/charts/_rels/${name}.xml.rels`,workbookRelationship('package',`../embeddings/${name}.xlsx`));
  zip.file(`ppt/embeddings/${name}.xlsx`,await chartWorkbook(JSZip,chart));
  return chartPath;
}
