import { expect, test } from '@playwright/test';

test('native multiplayer diagnostics show traffic, live state and clean up after leaving', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.VITE_NETWORK_DEBUG !== '1',
    'Run with VITE_NETWORK_DEBUG=1 to enable diagnostics.',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const overlay = page.locator('#colyseus-debug-shadow-host');
  await expect(overlay).toHaveCount(0);
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click();
  await page.locator('#server-address').fill('http://127.0.0.1:2568');
  await page.getByRole('button', { name: 'Add server', exact: true }).click();
  await page.locator('#driver-name').fill('Debugger');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#races-panel')).toBeVisible();
  await expect(overlay).toHaveCount(0);
  await page.getByRole('button', { name: 'Create race', exact: true }).click();
  await expect(page.locator('#lobby-panel')).toBeVisible();
  // Playwright locators pierce the SDK's open shadow root; game CSS stays isolated.
  const panel = overlay.locator('[id^="debug-panel-"]');
  await expect(panel).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'State', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Drop', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'State', exact: true }).click();
  const viewer = overlay.locator('#debug-state-inspector-modal');
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('lobby');
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await page.locator('#online-ready').check();
  await page.locator('#online-start').click();
  await expect(page.locator('#race-canvas')).toHaveAttribute('data-phase', 'racing');
  await expect(panel).toContainText(/\d+(?:\.\d+)?\s*(?:B|KB)\/s/);
  await expect(panel).toContainText(/\d+ms/);
  await expect(panel).toContainText(/[1-9]\d* messages/);
  await expect(panel).not.toContainText('NaN');
  await expect(panel.locator('canvas')).toHaveCount(2);
  // Legacy message rooms have no timed input clock: do not report invented jitter.
  await expect(panel).not.toContainText('jitter');
  await panel.getByRole('button', { name: 'State', exact: true }).click();
  await expect(viewer).toContainText('racing');
  await expect(viewer).toContainText('cars');
  await page.screenshot({ path: testInfo.outputPath('network-debug.png') });
  const before = await viewer.textContent();
  await expect.poll(() => viewer.textContent()).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await page.locator('#leave').click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('#races-panel')).toBeVisible();
  expect(errors).toEqual([]);
});
