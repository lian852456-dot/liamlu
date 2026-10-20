const {test,expect}=require('@playwright/test');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:4176/';
const fifty='合成具體做法與改善行動'.repeat(5);
async function setup(page,date='2026-10-21',seg=16) {
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await page.goto(base+'index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>document.getElementById('personalStore').options.length>1);
  await page.evaluate(({date,seg})=>{
    localStorage.clear();
    window.__writes=[];
    privateDashboardPost=async payload=>{window.__writes.push(payload);throw new Error('Synthetic cloud unavailable');};
    document.getElementById('personalStore').value=STORES[0];
    document.getElementById('personalName').value='合成測試對象';
    document.getElementById('fillDate').value=date;
    document.querySelector('button[onclick="switchTab(\'personal\')"]').click();
    _applyPersonalUI(STORES[0],'合成測試對象');
    setPersonalSeg(seg);
  },{date,seg});
}
async function openFail(page){await page.locator('button[onclick="submitPersonalData()"]').click();await expect(page.locator('#personalFailSection')).toBeVisible();}
async function complete(page){
  await page.locator('#p_fail_reason').fill('合成原因：依需求安排具體改善');
  await page.locator('#p_improve_plan').fill(fifty);
  await page.locator('#p_consult_store').fill('合成請益店');
  await page.locator('#p_consult_person').fill('合成請益對象');
  await page.locator('#p_consult_method').fill(fifty);
}
for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test.describe(`${viewport.width}px`,()=>{
    test.use({viewport});
    test('live counters, missing fields, 49/50, short save and exact existing payload',async({page},info)=>{
      await setup(page);await openFail(page);
      await expect(page.locator('#personalFailRule')).toContainText('2026-10-21');
      await expect(page.locator('#personalFailRule')).toContainText('店長／指定代理');
      await page.locator('#p_improve_plan').fill('改'.repeat(49)+' ，！\n');
      await page.locator('#p_consult_method').fill('😀'.repeat(50));
      await expect(page.locator('#p_improve_count')).toContainText('49 / 50');
      await expect(page.locator('#p_consult_count')).toContainText('50 / 50');
      await expect(page.locator('#personalFailQualification')).toContainText('缺欄：未過關原因、請益店點、請益人員');
      await page.locator('button[onclick="submitPersonalFail()"]').click();
      await expect(page.locator('#p_fail_reason')).toBeFocused();
      expect(await page.evaluate(()=>window.__writes.length)).toBe(0);
      await page.locator('#p_fail_reason').fill('合成原因');
      await page.locator('#p_improve_plan').fill('');
      await page.locator('button[onclick="submitPersonalFail()"]').click();
      await expect(page.locator('#p_improve_plan')).toBeFocused();
      await page.locator('#p_improve_plan').fill('改'.repeat(49));
      await page.locator('button[onclick="submitPersonalFail()"]').click();
      await expect(page.locator('#personalFailSavedStatus')).toContainText('已儲存於本機；雲端結果尚待確認');
      await expect(page.locator('#personalFailSavedStatus')).toContainText('未達免扣文字條件');
      const payload=await page.evaluate(()=>window.__writes.find(row=>row.action==='pwrite'));
      expect(payload.record.extra).toEqual({fail_reason:'合成原因',improve_plan:'改'.repeat(49),consult_store:'',consult_person:'',consult_method:'😀'.repeat(50),customers:'',sold_items:''});
      expect(payload.date).toBe('2026-10-21');expect(payload.seg).toBe(16);
      await openFail(page);
      for(const id of ['p_consult_method','p_consult_store','p_consult_person'])await expect(page.locator('#'+id)).toHaveValue('');
      await complete(page);
      await page.locator('#p_improve_plan').fill('改'.repeat(50));
      await page.locator('#p_consult_method').fill('益'.repeat(49));
      await expect(page.locator('#personalFailQualification')).toContainText('請益內容 49/50');
      await page.locator('#p_consult_method').fill('益， '.repeat(50));
      await expect(page.locator('#personalFailQualification')).toContainText('本段達到');
      await page.locator('#p_consult_person').fill('');
      await expect(page.locator('#personalFailQualification')).toContainText('缺欄：請益人員');
      await page.locator('#p_consult_person').fill('合成請益對象');
      await expect(page.locator('#personalFailQualification')).toContainText('另一時段原始個人回報及督導覆核');
      await page.locator('#personalFailRule').scrollIntoViewIfNeeded();
      await page.screenshot({path:info.outputPath('synthetic-rule.png')});
      await page.locator('button[onclick="submitPersonalFail()"]').scrollIntoViewIfNeeded();
      await page.screenshot({path:info.outputPath('synthetic-feedback.png')});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.locator('button[onclick="submitPersonalFail()"]').click();
      await expect(page.locator('#personalFailSavedStatus')).toContainText('尚未確認每日未過關 −3 免扣');
      await page.locator('#pSeg21').click();
      await openFail(page);await complete(page);
      await page.locator('button[onclick="submitPersonalFail()"]').click();
      await expect(page.locator('#personalFailSavedStatus')).toContainText('尚未確認每日未過關 −3 免扣');
      expect(await page.evaluate(()=>[16,21].every(seg=>!!_loadReview(STORES[0],'合成測試對象','2026-10-21',seg)))).toBe(true);
    });
    test('old report date does not apply new threshold even when current clock is later; 21:00 only remains pending',async({page})=>{
      await setup(page,'2026-10-20',21);await openFail(page);
      await page.locator('#p_fail_reason').fill('合成原因');await page.locator('#p_improve_plan').fill('短改善');
      await expect(page.locator('#personalFailQualification')).toContainText('2026-10-20 21:00｜此回報日期不套用');
      await page.locator('button[onclick="submitPersonalFail()"]').click();
      await expect(page.locator('#personalFailSavedStatus')).toContainText('不追改歷史結算');
      await page.evaluate(()=>document.getElementById('fillDate').value='2026-10-21');
      await openFail(page);await complete(page);
      await page.locator('button[onclick="submitPersonalFail()"]').click();
      await expect(page.locator('#personalFailSavedStatus')).toContainText('2026-10-21 21:00｜本段達到');
      await expect(page.locator('#personalFailSavedStatus')).toContainText('尚未確認每日');
    });
    test('all-pass record saves unchanged extra={} without any exemption text gate',async({page})=>{
      await setup(page);
      await page.evaluate(()=>PERSONAL_ITEMS.forEach(item=>{const el=document.getElementById('p_'+item.key);if(el)el.value=String(item.type==='pct'?100:1);}));
      await page.locator('button[onclick="submitPersonalData()"]').click();
      await expect(page.locator('#personalFailSection')).toBeHidden();
      const payload=await page.evaluate(()=>window.__writes.find(row=>row.action==='pwrite'));
      expect(payload.record.failed).toEqual([]);expect(payload.record.extra).toEqual({});
    });
  });
}
