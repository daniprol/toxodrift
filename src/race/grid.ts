import type { TrackData } from '../assets/track';
import { sampleMap } from '../assets/track';
import { forward } from './math';
import { canOccupy } from './physics';

/** Preserve the authored grid; find extra rear slots in the final approach to the start line. */
export function startingGrid(track: TrackData, count: number, radius: number) {
  const starts = track.definition.starts.slice(0, count).map((start) => ({ ...start }));
  const anchors = track.definition.starts.slice(-2);
  const spacing = radius * 2 + 8;
  for (let index = starts.length; index < count; index++) {
    const anchor = anchors[(index - track.definition.starts.length) % anchors.length]!;
    const heading = forward(anchor.direction);
    const zone = sampleMap({ track, map: 'checkpoints', ...anchor });
    let found = false;
    for (let back = spacing; back <= spacing * 8 && !found; back += 4) {
      for (const side of [0, -8, 8, -16, 16, -24, 24, -32, 32]) {
        const position = {
          x: anchor.x - heading.x * back + heading.y * side,
          y: anchor.y - heading.y * back - heading.x * side,
          direction: anchor.direction,
        };
        if (
          canOccupy({ track, position, radius }) &&
          [zone, Math.max(0, zone - 1)].includes(
            sampleMap({ track, map: 'checkpoints', ...position }),
          ) &&
          starts.every((other) => Math.hypot(position.x - other.x, position.y - other.y) >= spacing)
        ) {
          starts.push(position);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      throw new Error(`Circuit ${track.definition.name} has no safe ${count}-car grid`);
    }
  }
  return starts;
}
