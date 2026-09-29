const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE_URL = process.env.TEST_BASE_URL
  ? new URL('home.html', process.env.TEST_BASE_URL).href
  : 'file://' + path.resolve(__dirname, '../home.html');
const ORIGINAL_HREFS = ['index.html', 'kpi.html', 'kpitry.html', 'patrol.html', 'https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec'];
const STORE_INSPECTION_URL = 'https://twm-store-inspection.liamlu245.chatgpt.site/';

test('同仁大廳以 KPI、台獎、金牌為前三個入口，既有店務檢查入口保持安全連結', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PAGE_URL);

  const staffCards = page.locator('[aria-label="同仁大廳"] .card');
  await expect(staffCards).toHaveCount(8);
  await expect(staffCards.first()).toContainText('KPI 戰情');
  await expect(staffCards.first()).toContainText('員編登入 · 核准裝置');
  await expect(staffCards.first()).toHaveAttribute('href', 'kpi-battle.html');
  await expect(staffCards.nth(1)).toContainText('台獎戰情');
  await expect(staffCards.nth(1)).toContainText('員編登入 · 核准裝置');
  await expect(staffCards.nth(1)).toHaveAttribute('href', 'awards-battle.html');
  await expect(staffCards.nth(2)).toContainText('北一二B 金牌明細');
  await expect(staffCards.nth(2)).toHaveAttribute('href', 'gold-medal.html');
  await expect(staffCards.nth(6)).toContainText('稽核回報專區');
  await expect(staffCards.nth(6)).toContainText('門市填報・稽核前確認');
  await expect(staffCards.nth(6)).toContainText('上傳環境清潔照片，查看補件狀態');
  await expect(staffCards.nth(6)).toHaveAttribute('href', 'audit-report.html');
  await expect(staffCards.nth(7)).toContainText('門市使用');
  await expect(staffCards.nth(7)).toContainText('檢');
  await expect(staffCards.nth(7)).toContainText('門市店務檢查');
  await expect(staffCards.nth(7)).toHaveAttribute('href', STORE_INSPECTION_URL);
  await expect(staffCards.nth(7)).toHaveAttribute('target', '_blank');
  await expect(staffCards.nth(7)).toHaveAttribute('rel', 'noopener noreferrer');

  const boxes = await staffCards.evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[0].y).toBe(boxes[2].y);
  expect(boxes[3].y).toBe(boxes[4].y);
  expect(boxes[3].y).toBe(boxes[5].y);
  expect(boxes[3].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[6].y).toBe(boxes[7].y);
  expect(boxes[6].y).toBeGreaterThan(boxes[3].y);
});

test('同仁大廳手機版維持單欄且文字未水平溢出，既有入口連結不變', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE_URL);

  const staffCards = page.locator('[aria-label="同仁大廳"] .card');
  const boxes = await staffCards.evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
  expect(boxes[3].y).toBeGreaterThan(boxes[2].y);
  expect(boxes[4].y).toBeGreaterThan(boxes[3].y);
  expect(await page.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);

  await expect(page.locator('.card')).toHaveCount(15);
  await expect(page.locator('[aria-label="督導專區"] .card')).toHaveCount(7);
  await expect(page.locator('[aria-label="督導專區"] .card[href="department-ops.html"]')).toContainText('北一二部｜部區管理');
  await expect(page.locator('[aria-label="督導專區"] .card[href="live-battle.html"]')).toContainText('行進間戰報');
  const allHrefs = await page.locator('.card').evaluateAll(cards => cards.map(card => card.getAttribute('href')));
  for (const href of ORIGINAL_HREFS) expect(allHrefs).toContain(href);
});
