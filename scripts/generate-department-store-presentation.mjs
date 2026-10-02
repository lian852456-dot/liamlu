// Local trusted converter. Input and outputs contain private store data: keep outside repo.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FileBlob, Presentation, PresentationFile } from '@oai/artifact-tool';
const require = createRequire(import.meta.url), C = require('../department-store-presentation-core.js');
const NAVY='#173C6A', GREY='#73849B', RED='#DE404B', GREEN='#129953', ORANGE='#DC8412';

export function createStorePresentation(source, {fontFamily='Heiti TC'} = {}) {
  if(source?.contract!==C.CONTRACT)throw new Error('簡報model契約不符');
  const pages=C.planPages(source);
  const p=Presentation.create({slideSize:{width:1600,height:900}});
  const text=(slide,value,x,y,w,h,size=22,color=NAVY,bold=false)=>{
    const s=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
    s.text=String(value);s.text.style={typeface:fontFamily,fontSize:size,color,bold,autoFit:'none',verticalAlignment:'middle'};return s;
  };
  const panel=(slide,x,y,w,h,color='#DCE5F0')=>slide.shapes.add({geometry:'roundRect',position:{left:x,top:y,width:w,height:h},fill:'#FFFFFF',line:{fill:color,width:1}});
  const table=(slide,values,x,y,width,height,widths,{size=20,rowHeight=26}={})=>{
    const t=slide.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width,height,columnWidths:widths.map(v=>v*width/widths.reduce((a,b)=>a+b,0)),values});
    t.borders.assign({fill:'#E5EDF5',width:0.6,style:'solid'});
    t.cells.block({row:0,column:0,rowCount:values.length,columnCount:values[0].length}).assign({textStyle:{typeface:fontFamily,fontSize:size,color:NAVY,bold:true,alignment:'center'},margins:{left:5,right:5,top:1,bottom:1},anchor:'center'});
    for(let i=0;i<values.length;i++)t.rows[i].height=i===0?30:Array.isArray(rowHeight)?rowHeight[i-1]:rowHeight;
    for(let i=0;i<values.length;i++)for(let j=0;j<values[0].length;j++){const cell=t.getCell(i,j);cell.fill=i===0?'#EEF3F8':i%2?'#FFFFFF':'#F8FAFC';if(j===0)cell.text.style={typeface:fontFamily,fontSize:size,color:NAVY,bold:true,alignment:'left'};}
    return t;
  };
  for(const page of pages){const model=page.model;
  const month=String(Number(model.targetMonth.slice(5))),scope=`${model.scope}　${model.storeCount} 家店`;
  const header=(slide,title,subtitle)=>{slide.background.fill='#FFFFFF';text(slide,'TWM',40,26,120,42,30,NAVY,true);text(slide,title,175,22,1210,63,44,NAVY,true);text(slide,subtitle,40,88,1500,32,20,GREY);};
  const kpi=(slide,index,label,value,caption,color=NAVY)=>{const x=40+index*383;panel(slide,x,133,365,106);text(slide,label,x+18,142,330,32,26,NAVY,true);text(slide,value,x+18,172,335,48,48,color,true);text(slide,caption,x+18,215,334,24,18,GREY);};
  if(page.kind==='trend'){const s1=p.slides.add();header(s1,`店舖近${model.period.length===6?'半年':model.period.length+'月'}店務管理成績表現${page.part>1?'（續'+page.part+'）':''}`,`${model.period[0].replace('-','.')} - ${model.period.at(-1).replace('-','.')}　${scope}`);
  kpi(s1,0,model.period.length===6?'近半年平均':'所選期間平均',C.fmt(model.summary.mean),'有效 '+model.summary.valid+' 筆店月');
  kpi(s1,1,month+'月平均',C.fmt(model.single.mean),'當月原G成績', '#277DD3');
  kpi(s1,2,month+'月滿分',`${model.single.perfect} / ${model.single.valid}`,'滿分率 '+C.fmt((model.single.rate==null?null:model.single.rate*100),1)+'%',GREEN);
  kpi(s1,3,'連續6月滿分',model.sixMonthEligibilityEvaluated?model.sixPerfectTotal+' 店':'未評估','完整6月資料資格',ORANGE);
  model.regions.forEach((r,i)=>{
    const index=model.regions.length===1?0:i,x=40+(index%2)*612,y=266+Math.floor(index/2)*284;
    panel(s1,x,y,596,index<2?282:294,r.color);text(s1,r.region,x+14,y+4,340,32,30,r.color,true);text(s1,'平均 '+C.fmt(r.half.mean),x+385,y+7,197,28,20,GREY,true);
    const widths=[148,...model.period.map(()=>60),60];const total=widths.reduce((a,b)=>a+b,0),scaled=widths.map(w=>w*568/total);
    const vals=[['店舖',...model.period.map(m=>m.slice(5)),'平均'],...r.rows.map(v=>[v.store,...v.cells.map(c=>C.fmt(c.score)),C.fmt(v.mean)])];
    const t=table(s1,vals,x+14,y+38,568,30+r.rows.length*21,scaled,{size:17,rowHeight:21});
    r.rows.forEach((v,ri)=>v.cells.concat([{score:v.mean}]).forEach((c,ci)=>{const cell=t.getCell(ri+1,ci+1);cell.fill=c.score==null?'#EEF1F5':c.score===100?'#E6F4E9':'#FBE9E9';cell.text.style={typeface:fontFamily,fontSize:17,bold:true,color:c.score==null?GREY:c.score===100?GREEN:RED,alignment:'center'};}));
  });
  const sidebarX=1276;panel(s1,sidebarX,266,284,318,'#EFB56F');text(s1,'連續6月滿分',sidebarX+16,276,254,37,27,ORANGE,true);
  if(model.sixMonthEligibilityEvaluated){model.sixPerfect.slice(0,6).forEach((v,i)=>text(s1,v.store,sidebarX+16,324+i*34,254,30,23,NAVY,true));if(model.sixPerfect.length>6)text(s1,`共${model.sixPerfect.length}店，完整名單見備註`,sidebarX+16,528,254,25,18,GREY);}
  else text(s1,'資料不足6月，未評估',sidebarX+16,328,254,65,23,NAVY,true);
  text(s1,'SPE +1規則及核定\n由管理者確認',sidebarX+16,536,250,42,18,ORANGE);
  panel(s1,sidebarX,600,284,234,'#EEA7AC');text(s1,month+'月重點',sidebarX+16,609,254,35,28,RED,true);
  text(s1,`未滿100分 ${model.single.low}店\n連續未滿100 ${model.single.continuous}店\n缺資料 ${model.single.missingStores}店`,sidebarX+16,658,254,108,24,NAVY,true);
  text(s1,`完整未滿分清單見第${page.firstMonthlyPage}頁起`,sidebarX+16,789,254,27,19,GREY);
  text(s1,'平均採有效店月原G成績。灰色—代表缺資料。店舖歷史未回填現任店長。',40,852,1500,30,18,GREY);
  s1.speakerNotes.textFrame.setText(JSON.stringify({source:'使用者提供北一二部店務成績原XLSX及受保護UI讀回',period:model.period,formula:'sum(valid score G)/count(valid store-month G)',summary:model.summary,regions:model.regions.map(r=>({region:r.region,summary:r.half,rows:r.rows})),sixPerfect:model.sixPerfect,notices:model.notices},null,2));

  text(s1,`${page.pageNumber} / ${page.totalPages}`,1460,883,100,17,16,GREY);
  }else{const s2=p.slides.add();header(s2,`${model.targetMonth.slice(0,4)}年${month}月店務成績表現${page.part>1?'（續'+page.part+'）':''}`,`${scope}　依成績由低至高排列，完整呈現未滿分店點`);
  kpi(s2,0,month+'月平均',C.fmt(model.single.mean),'當月有效成績 '+model.single.valid+'店','#277DD3');
  kpi(s2,1,'100分店數',`${model.single.perfect} / ${model.single.valid}`,'滿分率 '+C.fmt((model.single.rate==null?null:model.single.rate*100),1)+'%',GREEN);
  kpi(s2,2,'未達100分',model.single.low+' 店','缺資料 '+model.single.missingStores+'店',RED);
  kpi(s2,3,'連續未滿100',model.single.continuous+' 店','往前連續至少2月',ORANGE);
  text(s2,'未達100分店點排序',40,264,1130,44,30,RED,true);
  const deficit=[['序','區域','店舖',month+'月','連續','扣分','缺失原因'],...model.lowScores.map(r=>[r.order,r.region,r.store,C.fmt(r.score),r.streak>=2?`連${r.streak}月`:'—',C.fmt(r.deduction),C.reasonText(r)])];
  if(!model.lowScores.length)deficit.push(['—','—',model.lowScoresTotal?'此頁無續列':'無未滿分店點','—','—','—','—']);
  const t2=table(s2,deficit,40,314,1086,Math.min(494,34+deficit.length*42),[42,98,146,76,90,76,558],{size:20,rowHeight:model.lowRowHeights.length?model.lowRowHeights:[42]});
  for(let i=1;i<deficit.length;i++){for(const j of [3,5])t2.getCell(i,j).text.style={typeface:fontFamily,fontSize:20,color:RED,bold:true,alignment:'center'};t2.getCell(i,6).text.style={typeface:fontFamily,fontSize:18,color:NAVY,bold:true,alignment:'left'};}
  const right=1152;
  text(s2,'區域表現',right,267,408,38,28,NAVY,true);
  const rt=table(s2,[['區','平均','滿分/有效','%'],...model.regions.map(r=>[r.region,C.fmt(r.single.mean,1),`${r.single.perfect}/${r.single.valid}`,C.fmt((r.single.rate==null?null:r.single.rate*100),1)])],right,314,408,146,[106,88,123,91],{size:21,rowHeight:29});
  model.regions.forEach((r,i)=>rt.getCell(i+1,0).text.style={typeface:fontFamily,fontSize:21,color:r.color,bold:true});
  text(s2,'缺失原因 TOP',right,490,408,38,28,ORANGE,true);
  table(s2,[['原因（涉及店數）','店'],...model.reasonTop.map(r=>[r.category,r.stores])],right,536,408,238,[335,73],{size:21,rowHeight:model.reasonRowHeights});
  text(s2,'同店可多類，總數不必等於未滿分店數。',right,788,408,62,20,GREY);
  text(s2,'連續以當月往前逐月未滿100檢查，缺月即中斷。除台日/頁次/查核分數另列，其餘分項為原表單位。\n扣分為原F值，未換算件數。最長連續僅確認所選期間，期間之前未評估。',40,846,1500,46,18,GREY);
  s2.speakerNotes.textFrame.setText(JSON.stringify({targetMonth:model.targetMonth,summary:model.single,completeLowScores:model.lowScores,reasonTop:model.reasonTop,notices:model.notices},null,2));
  text(s2,`${page.pageNumber} / ${page.totalPages}`,1460,883,100,17,16,GREY);
  }}return p;
}

export async function generateStorePresentation(brief, options, config) {
  const {workspaceDir,outputDir,skillDir,pythonExecutable,binDir,fontFamily='Heiti TC'}=config;
  for(const v of [workspaceDir,outputDir,skillDir,pythonExecutable,binDir])if(!path.isAbsolute(v||''))throw new Error('需要bundled runtime及絕對輸出路徑');
  if(!outputDir.startsWith(workspaceDir+path.sep))throw new Error('產物需位於本task工作目錄');
  const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
  if(outputDir.startsWith(root+path.sep))throw new Error('真實資料輸出必須在repo外');
  const model=C.buildModel(brief,options),p=createStorePresentation(model,{fontFamily}),stem=config.stem || `北一二部_店務_${model.period[0]}_${model.targetMonth}`,stage=path.join(workspaceDir,'private-build',stem);
  await fs.mkdir(outputDir,{recursive:true});await fs.mkdir(stage,{recursive:true});
  const totalSlides=C.planPages(model).length;
  const {finalizePresentation}=await import(pathToFileURL(path.join(skillDir,'container_tools/artifact_tool_utils.mjs')).href);
  const candidatePath=path.join(stage,stem+'.draft.pptx'),finalPath=path.join(outputDir,stem+'.pptx');
  await (await PresentationFile.exportPptx(p)).save(candidatePath);
  const validation=await finalizePresentation({workspaceDir,candidatePath,finalPath,pythonExecutable,
    integrityValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_layout_geometry.py'),
    explicitTotalSlideCount:totalSlides,requiredNativeTableOwnerSlides:Array.from({length:totalSlides},(_,i)=>i+1),requiredNativeChartOwnerSlides:[],
    layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-heading-fit',...Array.from({length:totalSlides},(_,i)=>['--require-native-table-slide',String(i+1)]).flat()],
    fontPolicy:{basis:'design',families:[fontFamily]},verifyArtifactToolImport:true,receiptPath:path.join(stage,stem+'.validation.json')});
  const checked=await PresentationFile.importPptx(await FileBlob.load(finalPath));
  for(let i=0;i<totalSlides;i++) {
    await fs.writeFile(path.join(stage,`slide-${i+1}.png`),new Uint8Array(await(await checked.export({slide:checked.slides.items[i],format:'png',scale:1})).arrayBuffer()));
    await fs.writeFile(path.join(stage,`pdf-page-${i+1}.png`),new Uint8Array(await(await checked.export({slide:checked.slides.items[i],format:'png',scale:2})).arrayBuffer()));
  }
  await fs.writeFile(path.join(stage,stem+'.model.json'),JSON.stringify(model,null,2));
  await fs.writeFile(path.join(outputDir,stem+'.print.html'),C.renderPrintHtml(model));
  // Bundled headless LibreOffice drops CJK glyphs on this Mac. Export fixed-layout PDF
  // from the final re-imported PPTX render, without changing native editable PPTX objects.
  const pdfPath=finalPath.replace(/\.pptx$/,'.pdf');
  const pdf=spawnSync(pythonExecutable,[path.join(root,'scripts/store-presentation-pdf.py'),pdfPath,...Array.from({length:totalSlides},(_,i)=>path.join(stage,`pdf-page-${i+1}.png`))],{encoding:'utf8',timeout:60000});
  if(pdf.status!==0)throw new Error('PPTX已生成，PDF轉檔失敗：'+(pdf.stderr||pdf.stdout));
  await fs.stat(pdfPath);
  return {model,finalPath,pdfPath,printHtml:finalPath.replace(/\.pptx$/,'.print.html'),validation};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  const input=process.argv[2],output=process.argv[3];
  if(!input||!output)throw new Error('Usage: RUNTIME_NODE scripts/generate-department-store-presentation.mjs PRIVATE_BRIEF_JSON PRIVATE_OUTPUT_DIR [OPTIONS_JSON]');
  const brief=JSON.parse(await fs.readFile(input,'utf8')),options=JSON.parse(process.argv[4]||'{}');
  const result=await generateStorePresentation(brief,options,{workspaceDir:process.env.PRESENTATION_WORKSPACE,outputDir:path.resolve(output),skillDir:process.env.PRESENTATION_SKILL_DIR,pythonExecutable:process.env.RUNTIME_PYTHON,binDir:process.env.RUNTIME_BIN_DIR,stem:process.env.PRESENTATION_STEM,fontFamily:process.env.PRESENTATION_FONT||'Heiti TC'});
  console.log(JSON.stringify({pptx:result.finalPath,pdf:result.pdfPath,printHtml:result.printHtml,slides:C.planPages(result.model).length,stores:result.model.storeCount,validStoreMonths:result.model.summary.valid}));
}
