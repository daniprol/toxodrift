import { HUD_ASSETS, type HudAssets, type HudAssetName } from './interface';
import { PALETTE_BYTES, CAR_SPRITE_BYTES, DRIVING_MAP_SCALE } from './formats';
import { ManifestSchema, type AssetManifest, type TrackDefinition } from '../config/schemas/track';
import type { GameConfig } from '../config/schemas/game';
import type { TrackData } from './track';
import { alternateScenery } from './alternate-track';
import { decodeScenery, type Scenery } from './scenery';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/original/`;

export interface RaceAssets {
  track: TrackData;
  image: HTMLImageElement;
  palette: Uint8Array;
  sprites: ReadonlyMap<string, Uint8Array>;
  scenery: Scenery;
  hud: HudAssets;
}

async function binary(name: string, length?: number): Promise<Uint8Array> {
  const response = await fetch(`${ASSET_ROOT}${name}`);

  if (!response.ok) {
    throw new Error(`Unable to load ${name}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (length !== undefined && bytes.length !== length) {
    throw new Error(`Invalid ${name}: expected ${length} bytes, received ${bytes.length}`);
  }

  return bytes;
}

export async function loadManifest(): Promise<AssetManifest> {
  const response = await fetch(`${ASSET_ROOT}manifest.json`);

  if (!response.ok) {
    throw new Error('Original assets are missing. Run pnpm assets:setup, then reload.');
  }

  try {
    return ManifestSchema.parse(await response.json());
  } catch {
    throw new Error('Original assets are missing or invalid. Run pnpm assets:setup, then reload.');
  }
}

export function trackImageUrl(id: string): string {
  return `${ASSET_ROOT}${id}.png`;
}

export async function loadRaceAssets(options: {
  definition: TrackDefinition;
  config: GameConfig;
}): Promise<RaceAssets> {
  const { definition, config } = options;
  const area = definition.width * definition.height;
  const image = new Image();
  image.src = trackImageUrl(definition.id);

  const [terrain, checkpoints, racingLine, palette, sprites, scenery, hud] = await Promise.all([
    binary(`${definition.id}-terrain.bin`, area),
    binary(`${definition.id}-checkpoints.bin`, area / DRIVING_MAP_SCALE ** 2),
    binary(`${definition.id}-racingLine.bin`, area / DRIVING_MAP_SCALE ** 2),
    binary(`${definition.id}-palette.bin`, PALETTE_BYTES),
    Promise.all(
      config.cars.map(
        async (car) => [car.sprite, await binary(`${car.sprite}.bin`, CAR_SPRITE_BYTES)] as const,
      ),
    ),
    binary(`${definition.id}-scene.bin`).then(decodeScenery),
    Promise.all(
      Object.entries(HUD_ASSETS).map(
        async ([name, size]) =>
          [name as HudAssetName, await binary(`hud-${name}.bin`, size)] as const,
      ),
    ),
    image.decode(),
  ]);

  return {
    track: { definition, terrain, checkpoints, racingLine },
    image,
    palette,
    sprites: new Map(sprites),
    hud: new Map(hud),
    scenery: definition.id.endsWith('r')
      ? alternateScenery({ scenery, width: definition.width, height: definition.height })
      : scenery,
  };
}
