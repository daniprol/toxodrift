/** Shared dimensions of the original indexed graphics and driving maps. */
export const PALETTE_COLORS = 256;

export const PALETTE_CHANNELS = 3;

export const PALETTE_BYTES = PALETTE_COLORS * PALETTE_CHANNELS;

export const PALETTE_CHANNEL_SCALE = 4;

export const CAR_FRAME_SIZE = 40;

export const CAR_FRAME_COUNT = 96;

export const CAR_FRAME_DEGREES = 360 / CAR_FRAME_COUNT;

export const CAR_SPRITE_BYTES = CAR_FRAME_COUNT * CAR_FRAME_SIZE * CAR_FRAME_SIZE;

export const DRIVING_MAP_SCALE = 4;

export const DRIVING_TABLE_ENTRIES = 512;

export const STEERING_TABLE_OFFSET = 256;
