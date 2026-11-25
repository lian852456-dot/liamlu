const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');

const origin='https://nori-play.test';
const root=path.resolve(__dirname,'..');
test.beforeEach(async({page})=>{
  await page.clock.install({time:new Date('2026-11-25T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-25T00:01:00Z'));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url()), file=path.resolve(root,'.'+url.pathname);
    if(url.origin!==origin || !file.startsWith(root+path.sep) || !fs.existsSync(file))return route.abort();
    const types={'.js':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.webp':'image/webp'};
    return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)] || 'application/octet-stream'});
  });
});

test('ball and snack use distinct stages; replacing a game preserves the typed question',async({page})=>{
  await page.goto(origin+'/home.html#ask-nori');
  const cat=page.locator('#nori-toggle'),question=page.getByRole('textbox',{name:'向海苔提問'});
  await question.fill('我的問題');
  await page.getByRole('button',{name:'丟毛線球'}).click();
  await expect(cat).toHaveAttribute('data-pose','bat');
  await page.clock.runFor(1400);await expect(cat).toHaveAttribute('data-pose','pounce');
  await page.clock.runFor(900);await expect(cat).toHaveAttribute('data-pose','roll');
  await page.getByRole('button',{name:'餵零食'}).click();
  await page.clock.runFor(1950);await expect(cat).toHaveAttribute('data-pose','nibble');
  await page.clock.runFor(100);await expect(cat).toHaveAttribute('data-pose','groom');
  await page.clock.runFor(2300);await expect(cat).toHaveAttribute('data-pose','sit');
  await expect(question).toHaveValue('我的問題');
});
test('a second tap completes a high five or wakes the cat without closing the panel',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:375,height:667});
  await page.goto(origin+'/home.html#ask-nori');
  const cat=page.locator('#nori-toggle');
  await page.getByRole('button',{name:'擊掌',exact:true}).click();
  await expect(cat).toHaveAttribute('data-pose','highpaw');
  await cat.press('Enter');
  await expect(page.locator('#nori-feedback')).toContainText('肉球碰到你的手');
  await page.getByRole('button',{name:'陪牠打盹'}).click();
  await page.clock.runFor(10000);
  await expect(cat).toHaveAttribute('data-pose','sleep');
  await expect(cat).toHaveAccessibleName('叫醒海苔');
  await cat.click();
  await expect(cat).toHaveAttribute('data-pose','stretch');
  await expect(page.locator('#nori-panel')).toBeVisible();
  await page.getByRole('button',{name:'收合海苔小幫手'}).click();
  await page.clock.runFor(10000);
  await expect(cat).toHaveAttribute('data-pose','walk');
  await expect(cat).toHaveAccessibleName('問海苔');
});
