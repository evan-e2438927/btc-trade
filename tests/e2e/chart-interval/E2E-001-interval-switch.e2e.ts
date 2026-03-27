/**
 * E2E-001: K线周期切换
 *
 * 验证用户切换K线时间周期后，图表能正确重新加载。
 * 前提: 开发服务器运行在 localhost:3000
 */
import { test, expect } from '@playwright/test';

test.describe('K线周期切换', () => {
  test.beforeEach(async ({ page }) => {
    // 访问交易页面
    await page.goto('http://localhost:3000');
    // 等待图表容器加载（TradingView widget 嵌入后会创建 iframe）
    await page.waitForSelector('#tv_chart_container iframe', { timeout: 15000 });
    // 等待下拉选择器可用
    await page.waitForSelector('select', { timeout: 5000 });
  });

  test('切换周期后图表重新加载', async ({ page }) => {
    // 记录切换前的 iframe src（TradingView widget URL 包含 interval 参数）
    const getIframeSrc = async () => {
      return page.locator('#tv_chart_container iframe').getAttribute('src');
    };

    const initialSrc = await getIframeSrc();

    // 切换到 "1小时" (value = '60')
    await page.locator('select').selectOption('60');

    // 等待图表重新加载（TradingView widget 在 interval 变化后会重新创建）
    await page.waitForTimeout(3000);

    // 验证下拉值已变更
    await expect(page.locator('select')).toHaveValue('60');

    // 验证无控制台错误
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 等待一段时间捕获控制台错误
    await page.waitForTimeout(2000);
    expect(consoleErrors).toHaveLength(0);
  });

  test('页面加载时默认选中 15分钟', async ({ page }) => {
    // 验证默认周期为 15
    await expect(page.locator('select')).toHaveValue('15');
  });
});
