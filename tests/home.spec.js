const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../home.html');
const ORIGINAL_HREFS = ['index.html', 'kpi.html', 'kpitry.html', 'patrol.html', 'https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec'];
const STORE_INSPECTION_URL = 'https://twm-store-inspection.liamlu245.chatgpt.site/';

test('同仁大廳在桌機維持四張 2×2 圖卡，且新入口安全連至店務檢查網站', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PAGE_URL);

  const staffCards = page.locator('[aria-label="同仁大廳"] .card');
  await expect(staffCards).toHaveCount(4);
  await expect(staffCards.nth(3)).toContainText('門市使用');
  await expect(staffCards.nth(3)).toContainText('檢');
  await expect(staffCards.nth(3)).toContainText('門市店務檢查');
  await expect(staffCards.nth(3)).toContainText('完成每日、半月與每月店務檢查，支援備註及照片／影片上傳。');
  await expect(staffCards.nth(3)).toHaveAttribute('href', STORE_INSPECTION_URL);
  await expect(staffCards.nth(3)).toHaveAttribute('target', '_blank');
  await expect(staffCards.nth(3)).toHaveAttribute('rel', 'noopener noreferrer');

  const boxes = await staffCards.evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[2].y).toBe(boxes[3].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
});

test('同仁大廳手機版維持單欄且文字未水平溢出，既有入口連結不變', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PAGE_URL);

  const staffCards = page.locator('[aria-label="同仁大廳"] .card');
  const boxes = await staffCards.evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
  expect(boxes[3].y).toBeGreaterThan(boxes[2].y);
  await expect(page.locator('body')).toEvaluate(body => body.scrollWidth <= body.clientWidth);

  await expect(page.locator('.card')).toHaveCount(6);
  await expect(page.locator(`.card:not([href="${STORE_INSPECTION_URL}"])`)).toEvaluateAll(
    cards => cards.map(card => card.getAttribute('href')),
    ORIGINAL_HREFS
  );
});
