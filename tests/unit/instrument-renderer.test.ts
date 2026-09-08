import { expect, it } from 'vitest';
import { HUD_ASSETS, type HudAssetName } from '../../src/assets/interface';
import { InstrumentRenderer } from '../../src/rendering/instrument-renderer';
import { testRace } from '../helpers/fixtures';

it('shows each opponent’s damage across its name strip and clears it after repair', () => {
  const race = testRace({ opponents: 3 });
  const image: ImageData = {
    data: new Uint8ClampedArray(64 * 200 * 4),
    width: 64,
    height: 200,
    colorSpace: 'srgb',
  };
  // Only the canvas boundary is replaced; the real renderer composes its indexed planes.
  const canvas = {
    getContext: () => ({ createImageData: () => image, putImageData: () => {} }),
  } as unknown as HTMLCanvasElement;
  const hud = new Map<HudAssetName, Uint8Array>(
    Object.entries(HUD_ASSETS).map(([name, size]) => [name as HudAssetName, new Uint8Array(size)]),
  );
  hud.get('boards')!.fill(1);
  hud.get('damslid')!.fill(2);
  const palette = new Uint8Array(768);
  palette[3] = 10;
  palette[6] = 50;
  const renderer = new InstrumentRenderer({
    canvas,
    assets: { hud, palette },
    config: race.options.config,
    setup: race.options,
  });
  race.state.racers[2]!.health = 50;
  race.state.racers[3]!.health = 25;
  renderer.draw(race.state);
  const red = (x: number, y: number) => image.data[(y * 64 + x) * 4];

  expect(red(63, 104)).toBe(40); // Healthy opponent: original board remains visible.
  expect(red(31, 136)).toBe(40);
  expect(red(32, 136)).toBe(200); // Half health: overlay covers the right half.
  expect(red(15, 168)).toBe(40);
  expect(red(16, 168)).toBe(200); // Quarter health: three quarters are depleted.
  expect(red(32, 176)).toBe(200); // All nine rows of the original overlay are used.
  expect(red(32, 177)).toBe(40);

  race.state.racers[2]!.health = 100;
  renderer.draw(race.state);
  expect(red(63, 136)).toBe(40);
});
