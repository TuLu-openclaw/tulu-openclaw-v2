import { test, expect } from '@playwright/test';

test.describe('星枢OpenClaw 应用', () => {
  test('首页应正常加载', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/星枢OpenClaw|OpenClaw/);
  });

  test('侧边栏应可见', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('nav, aside, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('导航到设置页面正常', async ({ page }) => {
    await page.goto('/');
    const settingsLink = page.getByRole('link', { name: /settings|设置/i }).first();
    if (await settingsLink.isVisible({ timeout: 3000 })) {
      await settingsLink.click();
      await expect(page).toHaveURL(/settings|setting/i);
    }
  });
});
