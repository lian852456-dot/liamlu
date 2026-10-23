const fs=require('node:fs');
const path=require('node:path');
module.exports=({test,expect})=>{
  for(const width of [390,1280])for(const mode of ['verified','unverified','missing']) {
    test(`SYNTHETIC personal rank ${width}px ${mode}`,async({page},info)=>{
      const requests=[];
      await page.setViewportSize({width,height:844});
      await page.route('**/*',route=>{
        if(route.request().url()==='https://rank-fixture.test/')return route.fulfill({contentType:'text/html',body:'<html lang="zh-Hant"><meta charset="utf-8"><h1>合成測試：個人排名</h1><p id="kpiBattleSourceNote"></p><main id="kpiBattleContent"></main></html>'});
        requests.push(route.request().url());return route.abort();
      });
      await page.goto('https://rank-fixture.test/');
      await page.addScriptTag({path:path.resolve(__dirname,'../../kpi-battle-controller.js')});
      const html=fs.readFileSync(path.resolve(__dirname,'../../kpi-battle.html'),'utf8');
      const style=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];if(style)await page.addStyleTag({content:style});
      await page.evaluate(mode=>{
        const data={meta:{sourceFile:'1023.xlsx',month:'2026-10',snapshotDay:22},items:[],stores:[{code:'S1',name:'甲店'}],persons:[{pname:'甲*?',role:'店長',store:'S1',official:1.25,items:{}}]};
        const source={sheet:'上線數KPI_個人達成率_明細',column:'I',source_file:'1023.xlsx',data_as_of_date:'2026-10-22',sha256:'a'.repeat(64)};
        const snapshot={report_date:'2026-10-22',data_as_of_date:'2026-10-22',source_file:'1023.xlsx',personal_rank_semantics:mode==='unverified'?'store-rank':'individual-rank-v1',personal_rank_source:source,personal:[{name:'甲*［來源缺字］',role:'店長',store:'甲店',rank:mode==='missing'?null:17,rank_dod:null,overall_rate_dod:9}],stores:[],aggregate:{}};
        const controller=KpiBattleController.create({post:()=>{throw Error('No requests permitted');}});
        controller.acceptB({kpiResult:{data},privateResult:{profile:{},snapshot:{kpiBattle:snapshot}}});controller.setView('personal');
      },mode);
      const row=page.locator('#kpiBattleContent tbody tr').first();
      await expect(row.locator('td').nth(1)).toContainText('125.0%');
      await expect(row.locator('td').nth(2)).toHaveText(mode==='verified'?'17':'尚未有資料');
      expect(requests).toEqual([]);
      if(mode==='verified')await page.screenshot({path:info.outputPath(`SYNTHETIC-rank-${width}.png`),fullPage:true});
    });
  }
};
