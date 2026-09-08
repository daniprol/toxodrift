import { importInterface } from './lib/import-interface';
import { PALETTE_CHANNELS, PALETTE_CHANNEL_SCALE } from '../src/assets/formats';
import { PALETTE_BYTES, CAR_SPRITE_BYTES } from '../src/assets/formats';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { TrackCatalogSchema } from '../src/config/schemas/imports';
import { readBpa, requireAsset } from '../src/assets/bpa';
import { decodeBpk } from '../src/assets/bpk';
import { decodeTrack, type DecodedTrack } from '../src/assets/track';
import { decodeScenery } from '../src/assets/scenery';
import { alternateTrack } from '../src/assets/alternate-track';
import { parseConfig } from '../src/config/parse';
import { GameConfigSchema } from '../src/config/schemas/game';
import type { TrackDefinition } from '../src/config/schemas/track';

const SOURCE = resolve(process.argv[2] ?? '.local/original');
const DESTINATION = resolve('public/assets/original');
const catalog = parseConfig({
  text: await readFile('config/tracks.jsonc', 'utf8'),
  schema: TrackCatalogSchema,
  name: 'tracks.jsonc',
});

const config = parseConfig({
  text: await readFile('public/config/game.jsonc', 'utf8'),
  schema: GameConfigSchema,
  name: 'game.jsonc',
});

await mkdir(DESTINATION, { recursive: true });

const tracks: TrackDefinition[] = [];
async function exportTrack(track: DecodedTrack, scene: Uint8Array): Promise<void> {
  const { id, width, height, name, zones } = track.definition;
  tracks.push(track.definition);
  await writeFile(resolve(DESTINATION, `${id}-scene.bin`), scene);

  for (const map of ['terrain', 'checkpoints', 'racingLine', 'palette'] as const) {
    await writeFile(resolve(DESTINATION, `${id}-${map}.bin`), track[map]);
  }

  const png = new PNG({ width, height });

  for (let pixel = 0; pixel < track.pixels.length; pixel++) {
    for (let channel = 0; channel < PALETTE_CHANNELS; channel++) {
      png.data[pixel * 4 + channel] =
        track.palette[track.pixels[pixel]! * PALETTE_CHANNELS + channel]! * PALETTE_CHANNEL_SCALE;
    }

    png.data[pixel * 4 + 3] = 255;
  }

  await writeFile(resolve(DESTINATION, `${id}.png`), PNG.sync.write(png));
  console.log(`Imported ${name}: ${width}×${height}, ${zones} checkpoints`);
}

for (const entry of catalog) {
  const files = readBpa(await readFile(resolve(SOURCE, `${entry.id.toUpperCase()}.BPA`)));
  const track = decodeTrack({ ...entry, files });
  const scene = decodeBpk(requireAsset(files, `${entry.id.toUpperCase()}-SCE.BPK`));
  decodeScenery(scene);
  await exportTrack(track, scene);

  if (entry.alternate) {
    const palette = requireAsset(files, `${entry.id.toUpperCase()}-FLIP.PAL`);

    if (palette.length !== PALETTE_BYTES) {
      throw new Error(`Invalid alternate palette: ${entry.id}`);
    }

    await exportTrack(alternateTrack({ track, name: entry.alternate, palette }), scene);
  }
}

const engine = readBpa(await readFile(resolve(SOURCE, 'ENGINE.BPA')));

for (const car of config.cars) {
  const pixels = decodeBpk(requireAsset(engine, `${car.sprite.toUpperCase()}.BPK`));

  if (pixels.length !== CAR_SPRITE_BYTES) {
    throw new Error(`Invalid ${car.name} sprite size`);
  }

  await writeFile(resolve(DESTINATION, `${car.sprite}.bin`), pixels);
}

await writeFile(resolve(DESTINATION, 'manifest.json'), JSON.stringify({ version: 1, tracks }));
await importInterface(SOURCE, DESTINATION);
console.log('Original racing assets ready. Run pnpm dev.');
