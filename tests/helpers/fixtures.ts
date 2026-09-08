import { readFileSync } from 'node:fs';
import type { TrackData } from '../../src/assets/track';
import { parseConfig } from '../../src/config/parse';
import { GameConfigSchema } from '../../src/config/schemas/game';
import { Race } from '../../src/race/race';
import type { GameConfig } from '../../src/config/schemas/game';

export function gameConfig(): GameConfig {
  return parseConfig({
    text: readFileSync('public/config/game.jsonc', 'utf8'),
    schema: GameConfigSchema,
    name: 'fixture config',
  });
}

export function openTrack(): TrackData {
  const width = 400;
  const height = 400;

  return {
    definition: {
      id: 'tr0',
      name: 'Test circuit',
      width,
      height,
      zones: 4,
      starts: [
        { x: 100, y: 300, direction: 0 },
        { x: 150, y: 300, direction: 0 },
        { x: 200, y: 300, direction: 0 },
        { x: 250, y: 300, direction: 0 },
      ],
      pickups: [],
      drive: Array.from({ length: 512 }, () => 1),
    },
    terrain: new Uint8Array(width * height).fill(15),
    checkpoints: new Uint8Array((width * height) / 16),
    racingLine: new Uint8Array((width * height) / 16).fill(8),
  };
}

export function testRace(
  options: { opponents?: number; weapons?: boolean; track?: TrackData; config?: GameConfig } = {},
): Race {
  const suppliedConfig = options.config ?? gameConfig();
  const config = { ...suppliedConfig, race: { ...suppliedConfig.race, countdownSeconds: 0 } };

  return new Race({
    track: options.track ?? openTrack(),
    config,
    carId: 'vagabond',
    laps: 2,
    opponents: options.opponents ?? 0,
    weapons: options.weapons ?? true,
  });
}

export function paintCheckpoint(track: TrackData, zone: number): void {
  track.checkpoints.fill(zone);
}
