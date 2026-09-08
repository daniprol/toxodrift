import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { readBpa, requireAsset } from '../../src/assets/bpa';
import { decodeBpk } from '../../src/assets/bpk';
import { PALETTE_BYTES, PALETTE_CHANNEL_SCALE } from '../../src/assets/formats';
import { HUD_ASSETS } from '../../src/assets/interface';

interface MenuImage {
  name: string;
  asset: string;
  width: number;
  height: number;
  transparent?: boolean;
}

/** Keep original interface art reproducible, alongside the racing asset import. */
export async function importInterface(source: string, destination: string): Promise<void> {
  const menu = readBpa(await readFile(resolve(source, 'MENU.BPA')));
  const palette = requireAsset(menu, 'MENU.PAL');

  if (palette.length !== PALETTE_BYTES) {
    throw new Error(
      `Invalid MENU.PAL: expected ${PALETTE_BYTES} bytes, received ${palette.length}`,
    );
  }

  async function exportImage({
    name,
    asset,
    width,
    height,
    transparent = false,
  }: MenuImage): Promise<void> {
    const pixels = decodeBpk(requireAsset(menu, `${asset}.BPK`));

    if (pixels.length !== width * height) {
      throw new Error(
        `Invalid ${asset}.BPK: expected ${width * height} pixels, received ${pixels.length}`,
      );
    }

    const image = new PNG({ width, height });

    for (let i = 0; i < pixels.length; i++) {
      for (let channel = 0; channel < 3; channel++) {
        image.data[i * 4 + channel] = palette[pixels[i]! * 3 + channel]! * PALETTE_CHANNEL_SCALE;
      }
      image.data[i * 4 + 3] = transparent && pixels[i] === 0 ? 0 : 255;
    }
    await writeFile(resolve(destination, `${name}.png`), PNG.sync.write(image));
  }

  await exportImage({ name: 'menu-background', asset: 'MENUBG5', width: 640, height: 480 });
  await exportImage({
    name: 'menu-font',
    asset: 'F-BIG3A',
    width: 32,
    height: 96 * 32,
    transparent: true,
  });
  for (const [id, asset] of Object.entries({
    vagabond: 'KUPLA',
    dervish: 'PICKUP',
    sentinel: 'SEDAN',
    shrieker: 'CAMARO',
    wraith: 'PORSCHE',
    deliverator: 'LOTUS',
  })) {
    await exportImage({ name: `portrait-${id}`, asset, width: 96, height: 64 });
  }

  const instruments = readBpa(await readFile(resolve(source, 'IBFILES.BPA')));
  for (const [name, size] of Object.entries(HUD_ASSETS)) {
    const asset = `${name.toUpperCase()}.BPK`;
    const pixels = decodeBpk(requireAsset(instruments, asset));

    if (pixels.length !== size) {
      throw new Error(`Invalid ${asset}: expected ${size} pixels, received ${pixels.length}`);
    }

    await writeFile(resolve(destination, `hud-${name}.bin`), pixels);
  }
}
