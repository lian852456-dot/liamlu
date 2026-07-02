const { test, expect } = require('@playwright/test');

const FILE_URL = 'file:///home/user/liamlu/index.html';

// Mock GAS 回應（讓 fetch 不需要真正連線）
async function mockGAS(page) {
  await page.route('https://script.google.com/**', async route => {
    const url = route.request().url();
    if (url.includes('action=ping')) {
      await route.fulfill({ json: { status: 'ok' } });
    } else if (url.includes('action=read')) {
      await route.fulfill({ json: { data: {} } });
    } else if (url.includes('action=write')) {
      await route.fulfill({ json: { status: 'ok' } });
    } else {
      await route.fulfill({ json: { status: 'ok', data: {} } });
    }
  });
}

test.describe('頁面載入', () => {
  test('標題與頁籤顯示正確', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await expect(page).toHaveTitle(/北一二B/);
    await expect(page.locator('.site-title')).toContainText('北一二');
    // 三個頁籤
    await expect(page.locator('.tab-btn')).toHaveCount(4);
  });

  test('日期 badge 顯示今日日期', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    const badge = page.locator('#todayBadge');
    await expect(badge).toBeVisible();
    const text = await badge.textContent();
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

test.describe('填報頁籤 - 門市選擇', () => {
  test('預設顯示填報面板', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await expect(page.locator('#panel-fill')).toBeVisible();
    await expect(page.locator('#panel-summary')).not.toBeVisible();
  });

  test('點選門市後顯示填報表單', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    // 填報表單初始隱藏
    await expect(page.locator('#fillFormArea')).not.toBeVisible();
    // 點選「通化」門市
    await page.locator('.store-card[data-store="通化"]').click();
    await expect(page.locator('#fillFormArea')).toBeVisible();
  });

  test('點選門市後 hero sub 更新', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="酒泉"]').click();
    const sub = page.locator('#fillHeroSub');
    await expect(sub).toContainText('酒泉');
  });

  test('九間門市卡片都存在', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    const stores = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
    for (const s of stores) {
      await expect(page.locator(`.store-card[data-store="${s}"]`)).toBeVisible();
    }
  });

  test('杭州南顯示 NEW badge', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    // new-badge class 表示新店
    await expect(page.locator('.store-card[data-store="杭州南"].new-badge')).toBeVisible();
  });

  test('選擇門市後 selected class 正確', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="萬大"]').click();
    await expect(page.locator('.store-card[data-store="萬大"]')).toHaveClass(/selected/);
    // 其他不應被選中
    await expect(page.locator('.store-card[data-store="通化"]')).not.toHaveClass(/selected/);
  });
});

test.describe('填報頁籤 - 時段切換', () => {
  test('預設 16:00 時段被選中', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await expect(page.locator('#newSeg16')).toHaveClass(/sel-16/);
    await expect(page.locator('#newSeg21')).not.toHaveClass(/sel-21/);
  });

  test('切換到 21:00 時段', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('#newSeg21').click();
    await expect(page.locator('#newSeg21')).toHaveClass(/sel-21/);
    await expect(page.locator('#newSeg16')).not.toHaveClass(/sel-16/);
  });
});

test.describe('填報頁籤 - 表單輸入', () => {
  test('KPI 欄位可以輸入數值', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="通化"]').click();
    const kpiInput = page.locator('#f_kpi');
    await kpiInput.fill('105');
    await expect(kpiInput).toHaveValue('105');
  });

  test('清除按鈕清空表單', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="通化"]').click();
    await page.locator('#f_kpi').fill('95');
    await page.locator('#f_5g').fill('80');
    // 點清除
    await page.locator('button:has-text("清除重填")').click();
    await expect(page.locator('#f_kpi')).toHaveValue('');
    await expect(page.locator('#f_5g')).toHaveValue('');
  });

  test('複製回報訊息顯示預覽區', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="六張犁"]').click();
    await page.locator('#f_kpi').fill('92');
    await page.locator('button:has-text("複製回報訊息")').click();
    await expect(page.locator('#copyPreview')).toBeVisible();
    const text = await page.locator('#copyText').inputValue();
    expect(text).toContain('六張犁');
    expect(text).toContain('16:00');
  });
});

test.describe('頁籤切換', () => {
  test('切換到彙整大盤', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("彙整大盤")').click();
    await expect(page.locator('#panel-summary')).toBeVisible();
    await expect(page.locator('#panel-fill')).not.toBeVisible();
  });

  test('切換到日期回放', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("日期回放")').click();
    await expect(page.locator('#panel-playback')).toBeVisible();
  });

  test('彙整大盤顯示填報狀態', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("彙整大盤")').click();
    // 填報狀態欄應有 9 個 chip（每間門市一個）
    const chips = page.locator('#fillStatus .fill-chip');
    await expect(chips).toHaveCount(9);
  });

  test('彙整大盤 16:00/21:00 時段切換', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("彙整大盤")').click();
    // 點 21:00
    await page.locator('#sumSeg21').click();
    await expect(page.locator('#summaryDateLabel')).toContainText('21:00');
  });
});

test.describe('日期回放', () => {
  test('選日期後點查詢顯示結果', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("日期回放")').click();
    // 設日期
    await page.locator('#playbackDate').fill('2026-06-25');
    await page.locator('button:has-text("查詢")').click();
    // 結果區出現回放標題
    await expect(page.locator('#playbackResult')).toContainText('回放');
  });
});

test.describe('設定 Modal', () => {
  test('點設定按鈕開啟 Modal', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('#connBadge').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
  });

  test('取消關閉 Modal', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('#connBadge').click();
    await page.locator('button.btn-secondary[onclick="closeSettings()"]').click();
    await expect(page.locator('#settingsModal')).not.toBeVisible();
  });
});

test.describe('個人追蹤 - 新增人員', () => {
  test('新增人員後可被選擇且表單顯示', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.click('button:has-text("個人追蹤")');
    await page.click('button[onclick="openAddNameModal()"]');
    await page.selectOption('#addNameStore', { index: 1 });
    await page.fill('#addNameInput', '測試員工A');
    await page.click('button[onclick="saveNewName()"]');
    await page.waitForTimeout(200);
    const name = await page.$eval('#personalName', el => el.value);
    expect(name).toBe('測試員工A');
    await expect(page.locator('#personalFormSection')).toBeVisible();
  });
});
