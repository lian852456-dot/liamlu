const FONT='Microsoft YaHei';
export function buildDeck(m,PptxGenJS,logoData){
 const ppt=new PptxGenJS();ppt.layout='LAYOUT_WIDE';ppt.author='北一二B';ppt.title='北一二B舊換新成效';ppt.subject='舊換新月目標、動員、排行與回收檢核';ppt.lang='zh-TW';
 ppt.theme={headFontFace:FONT,bodyFontFace:FONT,lang:'zh-TW'};
 const s=ppt.addSlide();s.background={color:'FFFFFF'};
 const text=(value,x,y,w,h,size=12,color='133A52',bold=false)=>s.addText(String(value),{x,y,w,h,fontFace:FONT,fontSize:size,color,bold,margin:0,valign:'middle',breakLine:false});
 if(!logoData)throw Error('台灣大哥大LOGO未載入');s.addImage({data:logoData,x:.25,y:.18,w:2.1,h:2.1*80/258});
 text('北一二B舊換新成效',2.7,.23,10.1,.45,26,'133A52',true);
 text(`${m.month}　來源 ${m.sourceStart}–${m.cutoff}　${m.personalRule}`,2.72,.76,10.2,.22,12,'566A76');
 const metrics=[['累積上線',m.actual+' 台',`店目標 ${m.target} 台　達成 ${m.attainment}%`],['人員動員',m.mobilizedPeople+' / '+m.totalPeople+' 人',`動員佔比 ${m.peopleShare}%　個人合計 ${m.personalTotal} 台`],['門市動員',m.mobilizedStores+' / '+m.totalStores+' 店',`動員佔比 ${m.storeShare}%`],['近五天上線',m.trend.filter(d=>d.units!==null).reduce((n,d)=>n+d.units,0)+' 台',`${m.trend[0].date.slice(5)}–${m.cutoff.slice(5)}`]];
 metrics.forEach(([label,value,detail],i)=>{const x=.28+i*3.27;text(label,x,1.08,3.1,.22,14,'133A52',true);text(value,x,1.38,3.1,.49,32,i===0?'E76516':'133A52',true);text(detail,x,1.92,3.1,.25,12,'566A76');});
 text('TOP 回收機款',.28,2.4,3.2,.27,15,'E76516',true);
 const table=(rows,x,y,w,widths,rowH=.27)=>s.addTable(rows,{x,y,w,colW:widths,rowH,fontFace:FONT,fontSize:12,color:'133A52',margin:[0,.02,0,.02],border:{type:'solid',pt:.3,color:'DDE5EB'},fill:'FFFFFF',autoPage:false,headerRows:1,valign:'middle'});
 table([['機款','台','佔比'],...m.topModels.map(p=>[p.model,p.units,p.share+'%'])],.28,2.79,3.18,[2.22,.36,.6],.26);
 text('近五天回收上線',3.74,2.4,3.7,.27,15,'E76516',true);
 const known=m.trend.filter(d=>d.units!==null);
 s.addChart(ppt.ChartType.line,[{name:'回收上線',labels:known.map(d=>d.date.slice(5)),values:known.map(d=>d.units)}],{
  x:3.72,y:2.76,w:3.67,h:1.86,showLegend:false,showTitle:false,fontFace:FONT,
  catAxisLabelFontFace:FONT,catAxisLabelFontSize:12,valAxisLabelFontFace:FONT,valAxisLabelFontSize:12,
  showValue:true,dataLabelFormatCode:'0',dataLabelPosition:'t',dataLabelBkgrdColor:'FFFFFF',dataLabelColor:'133A52',dataLabelFontFace:FONT,dataLabelFormatCodeSourceLinked:false,dataLabelFontSize:12,
  valAxisMinVal:0,valAxisMajorUnit:Math.max(1,Math.ceil(Math.max(0,...known.map(d=>d.units))/4)),showCatName:false,
  chartColors:['257EB1'],showMarker:true,markerSize:5,lineSize:2,showBorder:false,
  catAxisTitleFontFace:FONT,valAxisTitleFontFace:FONT,showValAxisTitle:false,showCatAxisTitle:false,
  showPercent:false,valGridLine:{color:'E7EDF1',width:.5},showLine:true
 });
 if(known.length<5)text('來源未涵蓋的日期不補零',3.75,4.64,3.67,.2,12,'566A76');
 text('回收必查與管理提醒',7.72,2.4,5.32,.27,15,'E76516',true);
 m.reminders.forEach((r,i)=>text((i<3?(i+1)+'. ':'')+r,7.72,2.8+[0,.4,.68,1.08,1.65][i],5.27,[.34,.23,.36,.48,.28][i],12,i>=3?'B23A2C':'133A52',i>=3));
 text('個人上線數排序',.28,4.78,9.5,.25,15,'E76516',true);
 text(`全部 ${m.totalPeople} 人　同筆數並列`,9.45,4.80,3.52,.21,12,'566A76');
 const cols=m.ranking.length>45?6:5,per=Math.ceil(m.ranking.length/cols),w=(12.76-(cols-1)*.12)/cols;
 for(let c=0;c<cols;c++){
  const rows=m.ranking.slice(c*per,(c+1)*per).map(p=>[p.rank,p.name+'／'+p.store,p.units]);
  table([['名次','人員／門市','台'],...rows],.28+c*(w+.12),5.10,w,[.4,w-.73,.33],.20);
 }
 text(m.targetRule+'人員動員＝有上線人數／全員人數。',.28,7.25,12.7,.22,12,'566A76');
 s.addNotes(`來源截止 ${m.cutoff}。${m.personalRule}。${m.targetRule}動員以累積回收上線大於0判定。店與個人目標獨立計算。排名同台數並列，完整列出全部${m.totalPeople}人。近五天依來源截止日往前五個日曆日，未涵蓋日期不補零。回收提醒由使用者本次提供的文字及附件整理。`);
 return ppt;
}
