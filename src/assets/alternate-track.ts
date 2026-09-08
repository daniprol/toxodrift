import type { Scenery } from './scenery';
import type { DecodedTrack } from './track';
import { normalizeDirection } from '../race/math';

interface AlternateTrackOptions {
  track: DecodedTrack;
  name: string;
  palette: Uint8Array;
}

/** The original alternate circuits are rotated 180°, with a separate palette. */
export function alternateTrack(options: AlternateTrackOptions): DecodedTrack {
  const { track, name, palette } = options;
  const { width, height } = track.definition;

  return {
    definition: {
      ...track.definition,
      id: `${track.definition.id}r`,
      name,
      starts: track.definition.starts.map((start) => ({
        x: width - 1 - start.x,
        y: height - 1 - start.y,
        direction: normalizeDirection(start.direction + 180),
      })),
      pickups: track.definition.pickups.map((point) => ({
        x: width - 1 - point.x,
        y: height - 1 - point.y,
      })),
    },
    pixels: track.pixels.slice().reverse(),
    terrain: track.terrain.slice().reverse(),
    checkpoints: track.checkpoints.slice().reverse(),
    racingLine: track.racingLine.slice().reverse(),
    palette,
  };
}

interface AlternateSceneryOptions {
  scenery: Scenery;
  width: number;
  height: number;
}

export function alternateScenery(options: AlternateSceneryOptions): Scenery {
  const { scenery, width, height } = options;

  return {
    objects: scenery.objects.map((object) => ({
      ...object,
      x: width - 1 - object.x,
      y: height - 1 - object.y,
      vertices: object.vertices.map((vertex) => ({ ...vertex, x: -vertex.x, y: -vertex.y })),
    })),
    textures: scenery.textures.map((texture) => ({
      ...texture,
      x: 256 * (width - 1) - texture.x - texture.width * texture.depth,
      y: 256 * (height - 1) - texture.y - texture.height * texture.depth,
      pixels: texture.pixels.slice().reverse(),
    })),
  };
}
