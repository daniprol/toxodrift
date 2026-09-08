import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { GameConfigSchema } from '../../src/config/schemas/game';
import { ManifestSchema } from '../../src/config/schemas/track';
import { parseConfig } from '../../src/config/parse';
import type { TrackData } from '../../src/assets/track';

export function loadServerAssets(root: string) {
  const config = parseConfig({
    text: readFileSync(resolve(root, 'public/config/game.jsonc'), 'utf8'),
    schema: GameConfigSchema,
    name: 'game.jsonc',
  });
  const directory = resolve(root, 'public/assets/original');
  const manifest = ManifestSchema.parse(
    JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8')),
  );
  const tracks = new Map<string, TrackData>();
  const fingerprint = createHash('sha256').update(JSON.stringify(manifest));
  for (const definition of manifest.tracks) {
    const read = (name: string, size: number) => {
      const bytes = new Uint8Array(
        readFileSync(resolve(directory, `${definition.id}-${name}.bin`)),
      );
      if (bytes.length !== size) {
        throw new Error(`Invalid ${definition.id}-${name}.bin`);
      }
      fingerprint.update(bytes);
      return bytes;
    };
    const area = definition.width * definition.height;
    tracks.set(definition.id, {
      definition,
      terrain: read('terrain', area),
      checkpoints: read('checkpoints', area / 16),
      racingLine: read('racingLine', area / 16),
    });
  }
  return { config, manifest, tracks, assetVersion: fingerprint.digest('hex') };
}
export type ServerAssets = ReturnType<typeof loadServerAssets>;
