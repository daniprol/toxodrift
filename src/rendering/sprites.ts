import { PALETTE_CHANNELS, PALETTE_CHANNEL_SCALE } from '../assets/formats';
import { CAR_FRAME_SIZE, CAR_FRAME_COUNT } from '../assets/formats';

const PAINT_FIRST = 15;
const PAINT_LAST = 24;

interface CreateCarAtlasOptions {
  pixels: Uint8Array;
  palette: Uint8Array;
  color: string;
}

/** Cache palette conversion once per car; every draw uses the authored rotation frame. */
export function createCarAtlas(options: CreateCarAtlasOptions): HTMLCanvasElement {
  const { pixels, palette, color } = options;
  const canvas = document.createElement('canvas');
  canvas.width = CAR_FRAME_SIZE * CAR_FRAME_COUNT;
  canvas.height = CAR_FRAME_SIZE;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D is unavailable');
  }

  const image = context.createImageData(canvas.width, canvas.height);
  const paint = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));

  for (let frame = 0; frame < CAR_FRAME_COUNT; frame++) {
    for (let y = 0; y < CAR_FRAME_SIZE; y++) {
      for (let x = 0; x < CAR_FRAME_SIZE; x++) {
        const index = pixels[frame * CAR_FRAME_SIZE * CAR_FRAME_SIZE + y * CAR_FRAME_SIZE + x]!;
        const target = (y * canvas.width + frame * CAR_FRAME_SIZE + x) * 4;

        if (index === 0) {
          continue;
        }

        for (let channel = 0; channel < PALETTE_CHANNELS; channel++) {
          image.data[target + channel] =
            index >= PAINT_FIRST && index <= PAINT_LAST
              ? paint[channel]! *
                (0.25 + ((index - PAINT_FIRST) / (PAINT_LAST - PAINT_FIRST)) * 0.75)
              : palette[index * PALETTE_CHANNELS + channel]! * PALETTE_CHANNEL_SCALE;
        }

        image.data[target + 3] = index <= 3 ? 90 : 255;
      }
    }
  }

  context.putImageData(image, 0, 0);

  return canvas;
}
