import { expect, test } from '@playwright/test';

async function expectViewportFit(page: import('@playwright/test').Page): Promise<void> {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth <= innerWidth,
      height: document.documentElement.scrollHeight <= innerHeight,
    })),
  ).toEqual({ width: true, height: true });
}

test('arrow keys edit setup and reach every circuit without scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#choose-track')).toBeFocused();
  const initial = await page.locator('#track-name').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#track-name')).not.toHaveText(initial!);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  const selected = await page.locator('#tracks button:focus').textContent();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#track-name')).toHaveText(selected!);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#car-name')).toHaveText('Dervish');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#laps')).toHaveValue('5');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#opponents')).toHaveValue('0');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#weapons')).not.toBeChecked();
  await expectViewportFit(page);
});

test('race fills wide and short viewports without distorting the pixel scale', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#race-canvas')).toBeVisible();
  for (const viewport of [
    { width: 1600, height: 720 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.locator('#race-canvas').evaluate((canvas: HTMLCanvasElement) => {
          const bounds = canvas.getBoundingClientRect();
          return Math.abs(canvas.width / canvas.height - bounds.width / bounds.height);
        }),
      )
      .toBeLessThan(0.01);
    const hud = await page.locator('#hud-canvas').boundingBox();
    const track = await page.locator('#race-canvas').boundingBox();
    expect(hud!.height).toBe(viewport.height);
    expect(track!.height).toBe(viewport.height);
    expect(hud!.width + track!.width).toBeCloseTo(viewport.width, 0);
    await expectViewportFit(page);
  }
});

test.describe('landscape touch controls', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test('touch driving supports simultaneous inputs and clears them on rotation and cancellation', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('#choose-track').click();
    const lastCircuit = page.locator('#tracks button').last();
    await expect(lastCircuit).toBeInViewport();
    await page.locator('#close-selection').click();
    await page.locator('#opponents').selectOption('0');
    await page.locator('#start').click();
    await expect(page.locator('#race-canvas')).toHaveAttribute('data-phase', 'countdown');
    await page.clock.runFor(7000);
    await expect(page.locator('#touch-controls')).toBeVisible();
    for (const button of await page.locator('#touch-controls button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(48);
      expect(bounds!.height).toBeGreaterThanOrEqual(48);
    }
    const client = await page.context().newCDPSession(page);
    const points = await Promise.all(
      ['joystick', 'turbo', 'fire'].map(async (action, id) => {
        const bounds = await page
          .locator(action === 'joystick' ? '#joystick' : `[data-drive="${action}"]`)
          .boundingBox();
        return { id, x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
      }),
    );
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await expect(page.locator('.is-held')).toHaveCount(3);
    points[0]!.y -= 44;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
    await page.clock.runFor(700);
    expect(Number(await page.locator('#ammo').textContent())).toBeLessThan(100);
    await expect(page.locator('#turbo-value')).not.toHaveText('100%');
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('.is-held')).toHaveCount(0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#rotate-message')).toBeVisible();
    await expect(page.locator('#race-canvas')).toHaveAttribute('data-phase', 'paused');
    await expect(page.locator('#touch-controls')).not.toBeVisible();
    await expect(page.locator('.is-held')).toHaveCount(0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#rotate-message')).not.toBeVisible();
    await page.locator('#resume').click();
    const turbo = Number(await page.locator('#turbo').getAttribute('value'));
    await page.clock.runFor(700);
    expect(Number(await page.locator('#turbo').getAttribute('value'))).toBeGreaterThanOrEqual(
      turbo,
    );
    await expectViewportFit(page);
    await page.locator('#leave').click();
    await expect(page.locator('#start')).toBeFocused();
  });

  test('joystick has a neutral dead zone, drives on drag, and hides unavailable controls', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('#opponents').selectOption('0');
    await page.locator('#weapons').uncheck();
    await page.locator('#start').click();
    await expect(page.locator('#race-canvas')).toHaveAttribute('data-phase', 'countdown');
    await page.clock.runFor(3500);
    await expect(page.locator('[data-drive="fire"]')).not.toBeVisible();
    await expect(page.locator('[data-drive="mine"]')).not.toBeVisible();
    await expect(page.locator('[data-drive="turbo"]')).toBeVisible();
    const track = page.locator('#race-canvas');
    // Read the track pixels so the pressed joystick overlay does not affect the comparison.
    const trackPixels = () => track.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    const stationary = await trackPixels();
    const bounds = await page.locator('#joystick').boundingBox();
    const origin = { id: 0, x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [origin] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...origin, x: origin.x + 3, y: origin.y - 3 }],
    });
    await page.clock.runFor(300);
    expect((await trackPixels()) === stationary).toBe(true);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...origin, x: origin.x + 30, y: origin.y - 44 }],
    });
    await page.clock.runFor(500);
    expect((await trackPixels()) === stationary).toBe(false);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.is-held')).toHaveCount(0);
    await page.locator('#pause').click();
    await expect(page.locator('#touch-controls')).not.toBeVisible();
    await page.locator('#resume').click();
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expectViewportFit(page);
  });
});

test('browser fullscreen can be entered from setup and exited during a race', async ({ page }) => {
  await page.goto('/');
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator('#fullscreen')).toHaveText('Exit full screen');
  await page.locator('#start').click();
  await expect(page.locator('#race-canvas')).toBeVisible();
  await expect(page.locator('#race-fullscreen')).toHaveText('Exit full screen');
  await page.locator('#race-fullscreen').click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.locator('#race-canvas')).toBeFocused();
  await expectViewportFit(page);
});
