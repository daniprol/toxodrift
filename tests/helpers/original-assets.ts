import { existsSync, readFileSync } from 'node:fs';
import { alternateTrack } from '../../src/assets/alternate-track';
import { readBpa, requireAsset } from '../../src/assets/bpa';
import { decodeTrack, type DecodedTrack } from '../../src/assets/track';
import type { Race } from '../../src/race/race';

export const HAS_ORIGINAL_ASSETS = Array.from({ length: 10 }, (_, index) =>
  existsSync(`.local/original/TR${index}.BPA`),
).every(Boolean);

if (process.env.REQUIRE_ORIGINAL_ASSETS && !HAS_ORIGINAL_ASSETS) {
  throw new Error('Run pnpm assets:setup before the original-asset integration tests');
}

interface OriginalTrackOptions {
  index: number;
  alternate?: boolean;
}

export function originalTrack(options: OriginalTrackOptions): DecodedTrack {
  const { index, alternate = false } = options;
  const files = readBpa(readFileSync(`.local/original/TR${index}.BPA`));
  const track = decodeTrack({ id: `tr${index}`, name: `TR${index}`, files });

  return alternate
    ? alternateTrack({
        track,
        name: `TR${index} alternate`,
        palette: requireAsset(files, `TR${index}-FLIP.PAL`),
      })
    : track;
}

export function runUntilFinished(race: Race, maximumSeconds: number): void {
  const maximumTicks = race.options.config.race.tickRate * maximumSeconds;

  for (let tick = 0; tick < maximumTicks && race.state.phase !== 'finished'; tick++) {
    race.step();
  }
}
