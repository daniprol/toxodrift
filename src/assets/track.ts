import {
  PALETTE_BYTES,
  CAR_FRAME_DEGREES,
  DRIVING_MAP_SCALE,
  DRIVING_TABLE_ENTRIES,
  STEERING_TABLE_OFFSET,
} from './formats';
import { TrackSchema, type TrackDefinition } from '../config/schemas/track';
import { decodeBpk } from './bpk';
import { requireAsset } from './bpa';

const IMAGE_HEADER_BYTES = 778;
const PALETTE_OFFSET = 10;
const MIN_TRACK_INFO_BYTES = 508;

export interface TrackData {
  definition: TrackDefinition;
  terrain: Uint8Array;
  checkpoints: Uint8Array;
  racingLine: Uint8Array;
}

export interface DecodedTrack extends TrackData {
  pixels: Uint8Array;
  palette: Uint8Array;
}

interface DecodeTrackOptions {
  id: string;
  name: string;
  files: ReadonlyMap<string, Uint8Array>;
}

export function decodeTrack(options: DecodeTrackOptions): DecodedTrack {
  const { id, name, files } = options;
  const prefix = id.toUpperCase();
  const info = requireAsset(files, `${prefix}-INF.BIN`);

  if (info.length < MIN_TRACK_INFO_BYTES) {
    throw new Error('Truncated track metadata');
  }

  const view = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const integer = (offset: number) => view.getUint32(offset, true);
  const driveBytes = requireAsset(files, `${prefix}-DRV.DAT`);

  if (driveBytes.length !== DRIVING_TABLE_ENTRIES * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error('Invalid track driving table');
  }

  const driveView = new DataView(driveBytes.buffer, driveBytes.byteOffset, driveBytes.byteLength);
  const definition = TrackSchema.parse({
    id,
    name,
    width: integer(0),
    height: integer(4),
    zones: integer(8),
    starts: Array.from({ length: 4 }, (_, index) => ({
      x: integer(12 + index * 12),
      y: integer(16 + index * 12),
      direction: integer(20 + index * 12) * CAR_FRAME_DEGREES,
    })),
    pickups: Array.from({ length: 16 }, (_, index) => ({
      x: integer(60 + index * 8),
      y: integer(64 + index * 8),
    })).filter((point) => point.x > 0 && point.y > 0),
    drive: Array.from({ length: DRIVING_TABLE_ENTRIES }, (_, index) =>
      driveView.getFloat32(index * 4, true),
    ),
  });

  const image = decodeBpk(requireAsset(files, `${prefix}-IMA.BPK`));
  const plane = (suffix: string, length: number) => {
    const decoded = decodeBpk(requireAsset(files, `${prefix}-${suffix}.BPK`));

    if (decoded.length !== IMAGE_HEADER_BYTES + length) {
      throw new Error(`Invalid ${prefix}-${suffix} dimensions`);
    }

    return decoded.slice(IMAGE_HEADER_BYTES);
  };

  const area = definition.width * definition.height;

  if (image.length !== IMAGE_HEADER_BYTES + area) {
    throw new Error('Invalid track image dimensions');
  }

  return {
    definition,
    pixels: image.slice(IMAGE_HEADER_BYTES),
    palette: image.slice(PALETTE_OFFSET, PALETTE_OFFSET + PALETTE_BYTES),
    terrain: plane('MAS', area),
    checkpoints: plane('VAI', area / DRIVING_MAP_SCALE ** 2),
    racingLine: plane('LR1', area / DRIVING_MAP_SCALE ** 2),
  };
}

interface SampleMapOptions {
  track: TrackData;
  map: 'terrain' | 'checkpoints' | 'racingLine';
  x: number;
  y: number;
}

export function sampleMap(options: SampleMapOptions): number {
  const { track, map, x, y } = options;
  const { width, height } = track.definition;

  if (x < 0 || y < 0 || x >= width || y >= height) {
    return map === 'terrain' ? 15 : 0;
  }

  const scale = map === 'terrain' ? 1 : DRIVING_MAP_SCALE;

  return track[map][Math.floor(y / scale) * (width / scale) + Math.floor(x / scale)]!;
}

/** DRV stores 256 target-speed factors followed by 256 steering factors. */
export function drivingFactors(
  track: TrackData,
  checkpoint: number,
): { speed: number; steering: number } {
  return {
    speed: track.definition.drive[checkpoint]!,
    steering: track.definition.drive[STEERING_TABLE_OFFSET + checkpoint]!,
  };
}
