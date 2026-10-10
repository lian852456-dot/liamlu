const test=require('node:test'),assert=require('node:assert/strict');

test('單日回收匯出只使用日期聚合且保留八欄 Excel 契約',async()=>{
  const E=await import('../tradein-export-core.mjs');
  const rules={...E.rulesForMonth('2026-10'),isDemo:false,selectedDate:'2026-10-02'};
  const person=['萬大','合＊甲','同仁',2,[{model:'i15PM 256G',units:2}]];
  const context={active:true,mode:'public',dailyAvailable:true,allowedStores:['萬大'],people:[person],currentPeople:[person],selectedStore:'萬大'};
  const model=E.buildExportModel(context,'all',rules);
  assert.equal(model.title,'舊換新單日回收提醒');
  assert.equal(model.showDifference,false);
  assert.match(model.scopeLabel,/2026-10-02 · 單日/);
  const text=E.reminderText(model);
  assert.match(text,/統計日期：2026-10-02/);
  assert.match(text,/當日回收：2 台/);
  assert.match(text,/回收機款：i15PM 256G × 2/);
  assert.doesNotMatch(text,/目前差異：|目標：/);
  const rows=E.workbookRows(model);
  assert.equal(rows.length,15);
  assert.deepEqual(rows[13],['店點','人員','職務','當日回收（台）','統計日期','', '回收機款','資料範圍']);
  assert.deepEqual(rows[14],['萬大','合＊甲','同仁',2,{date:'2026-10-02'},null,'i15PM 256G × 2','單日口徑']);
  const workbook=Buffer.from(E.createXlsx(model)).toString();
  assert.match(workbook,/r="E15"/);
  assert.doesNotMatch(workbook,/r="F15"/);
  assert.match(workbook,/單日口徑/);
  assert.throws(()=>E.buildExportModel(context,'all',{...rules,selectedDate:'2026-10-08'}),/不在已核對來源期間/);
  assert.throws(()=>E.buildExportModel({...context,dailyAvailable:false},'all',rules),/資料尚未提供/);
});
