// One readable summary; transaction identifiers stay in private processing.
export function addSalesSheet(book, metrics, reportDate, sourceFile) {
  const sheet = book.worksheets.add('配件包膜影音');
  sheet.showGridLines = false;
  sheet.getRange('A1:E17').format = {font:{name:'Noto Sans TC',size:16,color:'#17365D'},horizontalAlignment:'center',verticalAlignment:'center'};
  const widths = [170,230,230,260,300];
  for (let i=0;i<widths.length;i++) sheet.getRange(`${String.fromCharCode(65+i)}1:${String.fromCharCode(65+i)}17`).format.columnWidthPx=widths[i];
  sheet.getRange('A1:E1').merge();
  sheet.getRange('A1').values=[[`北一二B 配件・包膜・影音銷售｜${reportDate}`]];
  sheet.getRange('A1:E1').format={fill:'#17365D',font:{name:'Noto Sans TC',size:22,bold:true,color:'#FFFFFF'},rowHeight:48};
  sheet.getRange('A2:D2').merge();
  sheet.getRange('A2').values=[[`最新單日｜${metrics.data_as_of_date ?? '尚未有資料'}`]];
  sheet.getRange('E2').values=[[`${metrics.month} 月累計｜截至 ${metrics.month_as_of_date.slice(5)}`]];
  sheet.getRange('A2:E2').format={fill:'#EAF0F8',font:{size:14,bold:true},rowHeight:36};
  sheet.getRange('A3:E3').values=[['店點','配件銷售金額\n(元)','包膜與保貼金額\n(元)','MyVideo＆KKBOX\n上線合約數(筆)','自動保貼機適用款\n月累計銷售(筆)']];
  sheet.getRange('A3:E3').format={fill:'#FFCF17',font:{size:15,bold:true},wrapText:true,rowHeight:56};
  for (let i=0;i<metrics.rows.length;i++) {
    const data=metrics.rows[i], r=i+4;
    const show=(v,pending='尚未有資料')=>v===null || v===undefined ? pending : v;
    sheet.getRange(`A${r}:E${r}`).values=[[data.store,show(data.accessory_amount),show(data.film_amount),show(data.vk_contracts,'待補明細'),show(data.auto_film_month_count)]];
    sheet.getRange(`A${r}:E${r}`).format={fill:i===0?'#FFF1B8':i%2?'#FFFFFF':'#F1F5F9',font:{size:16,bold:i===0},rowHeight:38};
    sheet.getRange(`B${r}:E${r}`).format.numberFormat='#,##0.##';
  }
  sheet.getRange('A3:E13').format.borders={preset:'all',style:'thin',color:'#CBD5E1'};
  const notes=[
    `金額來源：${sourceFile}「上線數KPI_每日上線」；配件採「配件及其他營收」，包膜採「包膜與保貼營收」。`,
    '影音認列：5G、排除企客；MyVideo 與 KKBOX 合併依合約編號去重，相同合約只認列一筆。',
    `自動保貼機：${sourceFile}「AQ其他-包膜與保貼營收」，僅商品名稱含「自動保貼機適用款」，加總當月銷售筆數。`,
    metrics.status.vk==='ok' ? '影音為合約筆數，與公司 KPI 點數分開；月累計為本月截至資料日，非整月預估。' : '影音待補可核對的合約明細；不以公司 KPI 點數替代筆數。月累計為本月截至資料日。',
  ];
  notes.forEach((note,i)=>{
    const r=i+14;sheet.getRange(`A${r}:E${r}`).merge();sheet.getRange(`A${r}`).values=[[note]];
    sheet.getRange(`A${r}:E${r}`).format={font:{size:11,color:'#475569'},horizontalAlignment:'left',wrapText:true,rowHeight:30};
  });
  sheet.freezePanes.freezeRows(3);
  return sheet;
}
