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

test('the closed cat plays all new idle poses between patrols without being clicked', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto(origin+'/home.html');
  const cat = page.locator('#nori-toggle');
  await expect(cat).toHaveAttribute('data-pose','walk');
  await cat.evaluate(el => {
    window.noriPoses = [];
    new MutationObserver(() => window.noriPoses.push(el.dataset.pose))
      .observe(el, {attributes:true, attributeFilter:['data-pose']});
  });
  const atlas = page.waitForResponse(origin+'/app-assets/nori-idle.webp');
  await page.clock.runFor(4200);
  await expect(cat).toHaveAttribute('data-pose','sit');
  expect((await atlas).ok()).toBe(true);
  await page.evaluate(async () => {
    const image = new Image();
    image.src = 'app-assets/nori-idle.webp';
    await image.decode();
  });
  await page.clock.runFor(750);
  await expect(cat).toHaveAttribute('data-pose','yawn');
  const sprite = await cat.locator('.nori-cat').evaluate(el => {
    const style = getComputedStyle(el, '::before');
    return {image:style.backgroundImage, animation:style.animationName};
  });
  expect(sprite.image).toContain('nori-idle.webp');
  expect(sprite.animation).toBe('nori-yawn');
  await page.clock.runFor(66000);
  const poses = await page.evaluate(() => window.noriPoses);
  expect(poses).toEqual(expect.arrayContaining(['yawn','lookback','sniff','arch','scratch','loaf','groom','roll','sleep','stretch']));
  expect(poses.filter(pose => pose === 'walk').length).toBeGreaterThanOrEqual(7);
});

test('opening the question panel or hiding the tab cancels the pending idle motion', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto(origin+'/home.html');
  const cat = page.locator('#nori-toggle');
  await page.clock.runFor(4200);
  await expect(cat).toHaveAttribute('data-pose','sit');
  await page.locator('#ask-nori').click();
  await page.getByRole('textbox',{name:'向海苔提問'}).fill('本月門市 KPI');
  await page.clock.runFor(15000);
  await expect(cat).toHaveAttribute('data-pose','sit');
  await expect(page.locator('#nori-question')).toHaveValue('本月門市 KPI');
  await page.locator('#nori-close').click();
  await expect(cat).toHaveAttribute('data-pose','walk');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true, value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(15000);
  await expect(cat).toHaveAttribute('data-pose','sit');
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(cat).toHaveAttribute('data-pose','walk');
});
