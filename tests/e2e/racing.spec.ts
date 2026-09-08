import { expect, test } from '@playwright/test';
import { gameConfig } from '../helpers/fixtures';

test('driver can choose a race, drive, use weapons, pause, restart and return to the garage', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Single player', exact: true }).click();
  await page.getByRole('button', { name: 'Circuit', exact: true }).click();
  await page.getByRole('button', { name: 'Suburbia', exact: true }).click();
  await page.getByRole('button', { name: 'Car', exact: true }).click();
  await page.getByRole('button', { name: 'Dervish 65 mph' }).click();
  await page.locator('#race-form').getByLabel('Laps', { exact: true }).fill('2');
  await page.getByLabel('Cars', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Start race' }).click();

  const track = page.locator('#race-canvas');

  await expect(track).toHaveAttribute('data-phase', 'countdown');
  await page.clock.runFor(3500);

  await expect(track).toHaveAttribute('data-phase', 'racing');

  await page.clock.runFor(3500); // Original weapon safety period after the start.
  const before = await track.screenshot();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Shift');
  await page.keyboard.down('Space');
  await page.clock.runFor(1000);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Space');

  expect(await track.screenshot()).not.toEqual(before);
  expect(Number(await page.locator('#ammo').textContent())).toBeLessThan(100);
  expect(Number((await page.locator('#turbo-value').textContent())?.replace('%', ''))).toBeLessThan(
    100,
  );
  await page.keyboard.press('Escape');

  await expect(page.getByRole('heading', { name: 'Race paused' })).toBeVisible();

  const pausedTime = await page.locator('#time').textContent();
  await page.clock.runFor(3000);

  await expect(page.locator('#time')).toHaveText(pausedTime!);
  await page.getByRole('button', { name: 'Resume race' }).click();
  await page.clock.runFor(500);

  await expect(page.locator('#time')).not.toHaveText(pausedTime!);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();

  await expect(page.locator('#ammo')).toHaveText('100');
  await expect(page.locator('#time')).toHaveText('0:00.00');
  await page.getByRole('button', { name: 'Garage' }).click();

  await expect(page.getByRole('button', { name: 'Start race' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a spectator sees a complete original-track race and the results', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Single player', exact: true }).click();
  await page.locator('#race-form').getByLabel('Laps', { exact: true }).fill('1');
  await page.getByLabel('Cars', { exact: true }).selectOption('0');
  await page.getByLabel('Weapons enabled').uncheck();
  await page.getByRole('button', { name: 'Watch a race' }).click();

  await expect(page.locator('#race-canvas')).toHaveAttribute('data-phase', 'countdown');
  await page.clock.runFor(40000);

  await expect(page.getByRole('heading', { name: 'First across the line.' })).toBeVisible();
  await expect(page.locator('#overlay-detail')).toContainText('1 laps completed');
  await expect(page.locator('#best')).not.toHaveText('—');
});

test('missing assets produce actionable setup instructions', async ({ page }) => {
  await page.route('**/assets/original/manifest.json', (route) =>
    route.fulfill({ status: 404, body: 'Missing' }),
  );
  await page.goto('/');

  await expect(page.locator('#loading')).toContainText('pnpm assets:setup');
});

test('the garage fits a phone viewport and supports keyboard selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Single player', exact: true }).click();

  await page.getByRole('button', { name: 'Car', exact: true }).click();
  const car = page.getByRole('button', { name: 'Sentinel 80 mph' });
  await car.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#car-name')).toHaveText('Sentinel');
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('custom bindings drive the car and describe the controls, regardless of car ordering', async ({
  page,
}) => {
  const config = gameConfig();
  config.cars.reverse();
  config.controls.accelerate = ['KeyI'];
  config.controls.turbo = ['KeyK'];
  config.race.countdownSeconds = 0;

  await page.route('**/config/game.jsonc', (route) => route.fulfill({ json: config }));
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Single player', exact: true }).click();
  await page.getByLabel('Cars', { exact: true }).selectOption('0');

  const engineRequest = page.waitForRequest('**/effect-25.wav');
  await page.getByRole('button', { name: 'Start race' }).click();
  await engineRequest;

  const track = page.locator('#race-canvas');
  await expect(track).toHaveAccessibleName(/Accelerate: I/);
  await expect(page.locator('#controls')).toContainText('I Accelerate');
  await expect(page.locator('#controls')).toContainText('K Turbo');

  const before = await track.screenshot();
  await page.keyboard.down('i');
  await page.keyboard.down('k');
  await page.clock.runFor(1000);
  await page.keyboard.up('i');
  await page.keyboard.up('k');

  expect(await track.screenshot()).not.toEqual(before);
  await expect(page.locator('#turbo-value')).not.toHaveText('100%');
});

test('losing focus pauses the race and clears held controls before resuming', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Single player', exact: true }).click();
  await page.getByLabel('Cars', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Start race' }).click();
  await expect(page.locator('#race-canvas')).toHaveAttribute('data-phase', 'countdown');
  await page.clock.runFor(3500);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Shift');
  await page.clock.runFor(300);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));

  await expect(page.getByRole('heading', { name: 'Race paused' })).toBeVisible();
  const pausedTime = await page.locator('#time').textContent();
  const pausedTurbo = Number(await page.locator('#turbo').getAttribute('value'));
  await page.clock.runFor(1000);

  await expect(page.locator('#time')).toHaveText(pausedTime!);
  await page.getByRole('button', { name: 'Resume race' }).click();
  await page.clock.runFor(500);

  expect(Number(await page.locator('#turbo').getAttribute('value'))).toBeGreaterThanOrEqual(
    pausedTurbo,
  );
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Shift');
});

test('a failed track load returns to editable setup and can be retried', async ({ page }) => {
  await page.route(
    '**/tr1-terrain.bin',
    (route) => route.fulfill({ status: 503, body: 'Unavailable' }),
    { times: 1 },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Single player', exact: true }).click();
  await page.getByRole('button', { name: 'Start race' }).click();

  await expect(page.locator('#loading')).toContainText('Unable to load tr1-terrain.bin');
  await expect(page.getByRole('button', { name: 'Start race' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start race' }).click();

  await expect(page.locator('#race-canvas')).toBeVisible();
  await expect(page.locator('#race-title')).toHaveText('Suburbia');
});
