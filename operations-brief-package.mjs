import { TEMPLATE_HASH } from './operations-brief-core.mjs';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const P='http://schemas.openxmlformats.org/presentationml/2006/main';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export { sha };

export async function openPackage(bytes, JSZip) {
  const zip=await JSZip.loadAsync(bytes);
  const entries=Object.values(zip.files);
  if(entries.length>10000)throw Error('壓縮檔項目過多，請另存精簡版。');
  let total=0;
  for(const f of entries){const n=f._data?.uncompressedSize||0;total+=n;
    if(n>128*1024*1024||total>512*1024*1024)throw Error('解壓後資料過大，請分檔；尚未讀取工作表。');
    if(/(?:^|\/)vbaProject\.bin$/i.test(f.name)||/activeX\//i.test(f.name))throw Error('不支援含巨集或ActiveX的檔案，請另存無巨集版本。');
  }
  return zip;
}
export async function inspectTemplate(bytes, JSZip) {
  const hash=await sha(bytes);
  if(hash!==TEMPLATE_HASH)throw Error('請選原始15頁作戰範本；此版本尚未支援其他範本，請勿改名代替。');
  const zip=await openPackage(bytes,JSZip);
  const slides=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));
  if(slides.length!==15)throw Error('範本必須包含15頁。');
  const xml=await zip.file('ppt/presentation.xml').async('string');
  if(!/cx="12192000"\s+cy="6858000"/.test(xml))throw Error('範本尺寸不符。');
  return {sha256:hash,slides:15,imagePages:[6,7,9,10,11,13],editableCharts:0,editableTables:0};
}
function textShape(id,name,text,x,y,w,h,size=1800,color='173C6A',fill='') {
  const paragraphs=String(text).split('\n').map(t=>`<a:p><a:pPr/><a:r><a:rPr lang="zh-TW" sz="${size}" b="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Microsoft JhengHei"/><a:ea typeface="Microsoft JhengHei"/></a:rPr><a:t xml:space="preserve">${esc(t)}</a:t></a:r><a:endParaRPr lang="zh-TW" sz="${size}"/></a:p>`).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill?`<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`:'<a:noFill/>'}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="60000" tIns="35000" rIns="60000" bIns="35000" anchor="ctr"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
function nextId(xml){return Math.max(1,...Array.from(xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g),m=>+m[1]))+1;}
function append(xml,shapes){if(!xml.includes('</p:spTree>'))throw Error('範本形狀結構不符。');return xml.replace('</p:spTree>',shapes+'</p:spTree>');}
function draftBand(xml,meta,page){
  // Transparent watermark deliberately overlays; it never hides a data row or logo.
  const label=page===6&&meta.tradein?'待核草稿｜舊換新已對帳，來源年份待確認':'待核草稿｜範例原值及圖片未更新';
  const stamp=textShape(nextId(xml),'Operations draft status',label,1350000,2850000,10000000,900000,3600,'A4262C').replace('<a:srgbClr val="A4262C"/>','<a:srgbClr val="A4262C"><a:alpha val="22000"/></a:srgbClr>');
  return append(xml,stamp);
}
function nativeTable(id,rows,options={}){
  const {widths=[2200000,1800000,7000000],rowH=480000,x=600000,y=1350000,size=1500}=options;
  const cells=rows.map((row,ri)=>`<a:tr h="${rowH}">${row.map(v=>`<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-TW" sz="${size}"><a:solidFill><a:srgbClr val="${ri?'173C6A':'FFFFFF'}"/></a:solidFill><a:ea typeface="Microsoft JhengHei"/></a:rPr><a:t>${esc(v)}</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="${ri?'F0F5FA':'173C6A'}"/></a:solidFill></a:tcPr></a:tc>`).join('')}</a:tr>`).join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="作戰可編輯指標表"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${widths.reduce((n,w)=>n+w,0)}" cy="${rows.length*rowH}"/></p:xfrm><a:graphic><a:graphicData uri="${A}/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${widths.map(w=>`<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${cells}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
function blankPage(xml){return xml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g,shape=>/<a:t[ >]/.test(shape)?'':shape);}
function tradeinPage(base,model){
  if(model.contract!=='operations-tradein-store-aggregate-v1'||model.regions.length!==4)throw Error('舊換新資料契約不符');
  if(model.regions.some(r=>r.stores.length>12))throw Error('有區域超過12店，需要另行續頁；已停止避免漏列。');
  const pct=v=>v===null?'N/A':(v*100).toFixed(1)+'%';let xml=blankPage(base),id=nextId(xml);
  xml=append(xml,textShape(id++,'舊換新標題','北一二｜舊換新回收表現總覽',1700000,320000,10000000,600000,2800));
  const t=model.totals;
  xml=append(xml,textShape(id++,'舊換新來源與合計',`${model.periodText}｜原表未列年份，待確認｜${model.storeCount}店\n合計 ${t.total}（Apple ${t.apple}／Android其他 ${t.android}／僅折抵 ${t.creditOnly}）｜Device含Mac ${t.device}｜比率 ${pct(t.rate)}｜上期 ${t.previous}，MOM ${pct(t.mom)}`,500000,1000000,11200000,720000,1600));
  model.regions.forEach((r,i)=>{const x=400000+i*2850000;xml=append(xml,textShape(id++,r.region+'區表現',`${r.region}　${pct(r.rate)}\n合計 ${r.total}／Device ${r.device}；${r.storeCount}店`,x,1900000,2700000,670000,1500));
    const rows=[['店點','H / D','比率'],...r.stores.map(s=>[s.store.replace(/^台灣大哥大數位生活/,''),`${s.total}/${s.device}`,pct(s.rate)])];
    xml=append(xml,nativeTable(id++,rows,{x,y:2650000,widths:[1280000,800000,620000],rowH:Math.min(280000,Math.floor(3450000/rows.length)),size:1100}));});
  return append(xml,textShape(id++,'舊換新口徑','H含僅折抵未換新，不代表全部買新機。零分母為N/A。各店依比率排序，零值門市保留；年份／政策尚待核。',450000,6250000,11300000,430000,1200));
}
export async function buildDraft(bytes,meta,JSZip){
  if(meta.status!=='DRAFT_UNMAPPED')throw Error('此版本僅提供待核草稿。');
  await inspectTemplate(bytes,JSZip);
  const zip=await JSZip.loadAsync(bytes);
  let base15='';
  for(let i=1;i<=15;i++){
    const path=`ppt/slides/slide${i}.xml`;let xml=await zip.file(path).async('string');
    if(i===15)base15=xml;
    if(i===1)xml=xml.replace(/(<a:t[^>]*>)2026\.10(<\/a:t>)/,`$1${meta.periods.meeting.replace('-','.')} $2`);
    if(i===15){const s=meta.sourceFiles.map(v=>v.name+' ['+v.sha256.slice(0,12)+']').join('、');
      const body=(meta.highlights||'本月重點尚未填寫，請人工核對後補入。')+`\n\n會議月份：${meta.periods.meeting}；來源截止：${meta.periods.sourceDate}\n店務結算月：${meta.periods.storeMonth||'待提供'}；金牌末月：${meta.periods.goldEnd||'待提供'}\n政策版本：${meta.periods.policy||'待提供'}\n來源：${s}\n以上人工輸入；各章節資料尚未全部完成對映。`;
      xml=append(xml,textShape(nextId(xml),'人工重點與來源核對',body,650000,1550000,10800000,4700000,1800));
    }
    zip.file(path,draftBand(xml,meta,i));
  }
  if(meta.tradein){zip.file('ppt/slides/slide6.xml',draftBand(tradeinPage(base15,meta.tradein),meta,6));zip.file('ppt/slides/_rels/slide6.xml.rels',await zip.file('ppt/slides/_rels/slide15.xml.rels').async('string'));}
  // Reuse the template's blank white page and its master/logo, not a screenshot.
  let good=blankPage(base15);
  let id=nextId(good);
  good=append(good,textShape(id++,'好速標題','好速達成、點數與長約表現',1800000,320000,9200000,650000,3000));
  good=append(good,nativeTable(id++, [['指標','本期數值','來源與口徑'],['達成率','待公司來源','正式實績點數 ÷ 正式目標點數；缺值不補零'],['實績／目標點數','待公司來源','企客4G納入；降轉只依公司正式欄排除，勿套用VK'],['長約件數／占比','待公司定義','合約月數門檻與占比分母尚未確認'],['失敗原因彙整','尚未核對','只採好速原文；店級／個人分開去重，無紀錄不是0失敗']]));
  const failure=(meta.failures?'人工貼入、待核出處：\n'+meta.failures:'待提供好速可識別失敗原文、日期、店／個人層級及去重識別。');
  good=append(good,textShape(id++,'好速失敗原文待核',failure,650000,4050000,10800000,2250000,1700));
  let rels=await zip.file('ppt/slides/_rels/slide15.xml.rels').async('string');
  rels=rels.replace(/<Relationship\b[^>]*Type="[^"]*\/notesSlide"[^>]*\/?>(?:<\/Relationship>)?/g,'');
  // Carry the source master logo explicitly on the new page as well. Some
  // importers omit inherited artwork on a newly appended slide.
  const master=await zip.file('ppt/slideMasters/slideMaster1.xml').async('string');
  let logo=master.match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0];
  const logoRid=logo?.match(/r:embed="([^"]+)"/)?.[1];
  const masterRels=await zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels').async('string');
  const logoRel=Array.from(masterRels.matchAll(/<Relationship\b[^>]*\/>/g),m=>m[0]).find(r=>r.includes('Id="'+logoRid+'"'));
  const logoTarget=logoRel?.match(/Target="([^"]+)"/)?.[1];
  if(!logo||!logoTarget||!logoTarget.startsWith('../media/'))throw Error('無法保留範本原始LOGO，已停止產出。');
  if(meta.tradein){
    const path='ppt/slides/slide6.xml';let six=await zip.file(path).async('string');
    const sixLogo=logo.replace(/(<p:cNvPr\b[^>]*\bid=")\d+"/,(_,prefix)=>prefix+nextId(six)+'"').replace(/r:embed="[^"]+"/,'r:embed="rIdOperationsLogo"').replace(/(<a16:creationId\b[^>]*\bid=")[^"]+"/,(_,prefix)=>prefix+'{'+crypto.randomUUID().toUpperCase()+'}"');
    zip.file(path,append(six,sixLogo));
    const sixRels='ppt/slides/_rels/slide6.xml.rels';
    zip.file(sixRels,(await zip.file(sixRels).async('string')).replace('</Relationships>',`<Relationship Id="rIdOperationsLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${esc(logoTarget)}"/></Relationships>`));
  }
  logo=logo.replace(/(<p:cNvPr\b[^>]*\bid=")\d+"/,(_,prefix)=>prefix+nextId(good)+'"').replace(/r:embed="[^"]+"/,'r:embed="rIdOperationsLogo"').replace(/(<a16:creationId\b[^>]*\bid=")[^"]+"/,(_,prefix)=>prefix+'{'+crypto.randomUUID().toUpperCase()+'}"');
  good=append(good,logo);
  rels=rels.replace('</Relationships>',`<Relationship Id="rIdOperationsLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${esc(logoTarget)}"/></Relationships>`);
  zip.file('ppt/slides/slide16.xml',draftBand(good,meta,16));
  zip.file('ppt/slides/_rels/slide16.xml.rels',rels);
  let presentation=await zip.file('ppt/presentation.xml').async('string');
  const maxId=Math.max(255,...Array.from(presentation.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g),m=>+m[1]));
  zip.file('ppt/presentation.xml',presentation.replace('</p:sldIdLst>',`<p:sldId id="${maxId+1}" r:id="rIdOperationsGoodSpeed"/></p:sldIdLst>`));
  const pr='ppt/_rels/presentation.xml.rels';
  zip.file(pr,(await zip.file(pr).async('string')).replace('</Relationships>','<Relationship Id="rIdOperationsGoodSpeed" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide16.xml"/></Relationships>'));
  zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml').async('string')).replace('</Types>','<Override PartName="/ppt/slides/slide16.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'));
  if(zip.file('docProps/app.xml'))zip.file('docProps/app.xml',(await zip.file('docProps/app.xml').async('string')).replace(/<Slides>\d+<\/Slides>/,'<Slides>16</Slides>'));
  return zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
}
