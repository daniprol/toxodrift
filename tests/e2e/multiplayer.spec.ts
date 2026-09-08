import { expect, test } from '@playwright/test';

test('main menu offers both modes and single player supports two, four and six cars', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Single player', exact: true })).toBeFocused();
  const panel = await page.locator('#mode-menu').boundingBox();
  for (const button of await page.locator('#mode-menu button').all()) {
    const label = await button.locator('.bitmap-text').boundingBox();
    expect(label!.x).toBeGreaterThanOrEqual(panel!.x);
    expect(label!.x + label!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
  }
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Multiplayer', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Single player', exact: true }).click();
  for (const [value, cars] of [
    ['1', 2],
    ['3', 4],
    ['5', 6],
  ] as const) {
    await page.locator('#opponents').selectOption(value);
    await page.locator('#start').click();
    await expect(page.locator('#race-canvas')).toBeVisible();
    await expect(page.locator('#standings li')).toHaveCount(cars);
    await page.locator('#leave').click();
  }
  await expect(page.locator('#colyseus-debug-shadow-host')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('two browser identities can create, join, ready and drive an online race', async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const errors: string[] = [];
  for (const page of [first, second]) {
    page.on('pageerror', (error) => errors.push(error.message));
  }
  try {
    for (const [page, name] of [
      [first, 'Host'],
      [second, 'Guest'],
    ] as const) {
      await page.goto('/');
      await page.getByRole('button', { name: 'Multiplayer', exact: true }).click();
      await page.locator('#server-address').fill('http://127.0.0.1:2568');
      await page.getByRole('button', { name: 'Add server', exact: true }).click();
      await page.locator('#driver-name').fill(name);
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.locator('#races-panel')).toBeVisible();
    }
    await first.locator('#online-participants').selectOption('6');
    await first.locator('#online-ai').selectOption('4');
    await first.getByRole('button', { name: 'Create race', exact: true }).click();
    await expect(first.locator('#lobby-panel')).toBeVisible();
    await second.getByRole('button', { name: 'Refresh races', exact: true }).click();
    // Joining uses the host's settings, even when the guest's create form is invalid.
    await second.locator('#online-laps').fill('');
    await second.locator('#open-races button').first().click();
    await expect(second.locator('#lobby-panel')).toBeVisible();
    await first.locator('#online-ready').check();
    await second.locator('#online-ready').check();
    await expect(first.locator('#online-start')).toBeEnabled();
    await first.locator('#online-start').click();
    await expect(first.locator('#race-canvas')).toHaveAttribute('data-phase', 'racing');
    await expect(second.locator('#race-canvas')).toHaveAttribute('data-phase', 'racing');
    if (process.env.VITE_NETWORK_DEBUG !== '1') {
      await expect(first.locator('#colyseus-debug-shadow-host')).toHaveCount(0);
    }
    await expect(first.locator('#standings li')).toHaveCount(6);
    await expect(first.locator('#pause')).not.toBeVisible();
    await expect(second.locator('#restart')).not.toBeVisible();
    await second.keyboard.down('ArrowUp');
    await second.keyboard.down('Shift');
    await expect(second.locator('#turbo-value')).not.toHaveText('100%');
    await second.keyboard.up('ArrowUp');
    await second.keyboard.up('Shift');
    await first.locator('#leave').click();
    await expect(first.locator('#races-panel')).toBeVisible();
    await first.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    await expect(first.locator('#leaderboard-rows')).toContainText('Host');
    await expect(first.locator('#leaderboard-rows')).toContainText('Guest');
    expect(errors).toEqual([]);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
