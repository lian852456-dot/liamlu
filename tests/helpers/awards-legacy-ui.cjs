const { expect } = require('@playwright/test');

// Exercise the visible, explicit device-approved channel. The password channel
// hides these legacy inputs until the user chooses this entry.
async function chooseLegacyChannel(page) {
  const access = page.locator('#dashboard-b-access');
  await expect(access).toBeVisible();
  const options = access.locator('.b-options');
  if (await options.count() && await options.getAttribute('open') === null) {
    await options.locator('summary').click();
  }
  const more = access.locator('.b-more');
  if (await more.count() && await more.getAttribute('open') === null) {
    await more.locator('summary').click();
  }
  await access.getByRole('button', { name: '原員編通道', exact: true }).click();
  const form = page.locator('.private-lock:visible').filter({
    has: page.locator('input[placeholder="輸入員工編號"]'),
  });
  await expect(form).toHaveCount(1);
  return form;
}

async function submitLegacyLogin(page) {
  const form = page.locator('.private-lock:visible').filter({
    has: page.locator('input[placeholder="輸入員工編號"]'),
  });
  await form.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await form.getByRole('button', { name: '以員編登入' }).click();
}

async function showAwardDetails(page) {
  const details = page.locator('#awardsBattleContent details').filter({
    has: page.getByText('督導區與各店原始台獎明細（公司排名）', { exact: true }),
  });
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  await expect(details.locator('.award-model-grid')).toBeVisible();
}

module.exports = { chooseLegacyChannel, submitLegacyLogin, showAwardDetails };
