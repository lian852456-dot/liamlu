// One readable summary; transaction identifiers stay in private processing.
export function addSalesSheet(book, metrics, reportDate, sourceFile) {
  const sheet = book.worksheets.add('配件包膜銷售');
  sheet.showGridLines = false;
  sheet.getRange('A1:D16').format = {font:{name:'Noto Sans TC',size:16,color:'#17365D'},horizontalAlignment:'center',verticalAlignment:'center'};
  const widths = [170,260,260,310];
  for (let i=0;i<widths.length;i++) sheet.getRange(`${String.fromCharCode(65+i)}1:${String.fromCharCode(65+i)}16`).format.columnWidthPx=widths[i];
  sheet.getRange('A1:D1').merge();
  sheet.getRange('A1').values=[[`北一二B 配件・包膜銷售｜${reportDate}`]];
  sheet.getRange('A1:D1').format={fill:'#17365D',font:{name:'Noto Sans TC',size:22,bold:true,color:'#FFFFFF'},rowHeight:48};
  sheet.getRange('A2:C2').merge();
  sheet.getRange('A2').values=[[`最新單日｜${metrics.data_as_of_date ?? '尚未有資料'}`]];
  sheet.getRange('D2').values=[[`${metrics.month} 月累計｜截至 ${metrics.month_as_of_date.slice(5)}`]];
  sheet.getRange('A2:D2').format={fill:'#EAF0F8',font:{size:14,bold:true},rowHeight:36};
  sheet.getRange('A3:D3').values=[['店點','配件銷售金額\n(元)','包膜與保貼金額\n(元)','自動保貼機適用款\n月累計銷售(筆)']];
  sheet.getRange('A3:D3').format={fill:'#FFCF17',font:{size:15,bold:true},wrapText:true,rowHeight:56};
  for (let i=0;i<metrics.rows.length;i++) {
    const data=metrics.rows[i], r=i+4;
    const show=(v,pending='尚未有資料')=>v===null || v===undefined ? pending : v;
    sheet.getRange(`A${r}:D${r}`).values=[[data.store,show(data.accessory_amount),show(data.film_amount),show(data.auto_film_month_count)]];
    sheet.getRange(`A${r}:D${r}`).format={fill:i===0?'#FFF1B8':i%2?'#FFFFFF':'#F1F5F9',font:{size:16,bold:i===0},rowHeight:38};
    sheet.getRange(`B${r}:D${r}`).format.numberFormat='#,##0.##';
  }
  sheet.getRange('A3:D13').format.borders={preset:'all',style:'thin',color:'#CBD5E1'};
  const notes=[
    `金額來源：${sourceFile}「上線數KPI_每日上線」；配件採「配件及其他營收」，包膜採「包膜與保貼營收」。`,
    `自動保貼機：${sourceFile}「AQ其他-包膜與保貼營收」，僅商品名稱含「自動保貼機適用款」，加總當月銷售筆數。`,
    '月累計為本月截至資料日的銷售筆數，非整月預估。',
  ];
  notes.forEach((note,i)=>{
    const r=i+14;sheet.getRange(`A${r}:D${r}`).merge();sheet.getRange(`A${r}`).values=[[note]];
    sheet.getRange(`A${r}:D${r}`).format={font:{size:11,color:'#475569'},horizontalAlignment:'left',wrapText:true,rowHeight:30};
  });
  sheet.freezePanes.freezeRows(3);
  return sheet;
}
