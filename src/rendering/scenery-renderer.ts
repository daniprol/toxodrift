import { PALETTE_CHANNELS, PALETTE_CHANNEL_SCALE } from '../assets/formats';
import type { Scenery, SceneTexture } from '../assets/scenery';
import type { Position } from '../race/types';

const FIXED_POINT_SCALE = 256;

export class SceneryRenderer {
  private readonly textures: HTMLCanvasElement[];
  private readonly colors: string[];
  private readonly attachedTextures = new Map<
    string,
    { texture: SceneTexture; image: HTMLCanvasElement }[]
  >();

  constructor(
    private readonly scene: Scenery,
    palette: Uint8Array,
  ) {
    this.colors = Array.from(
      { length: 256 },
      (_, index) =>
        `rgb(${palette[index * PALETTE_CHANNELS]! * PALETTE_CHANNEL_SCALE} ${palette[index * PALETTE_CHANNELS + 1]! * PALETTE_CHANNEL_SCALE} ${palette[index * PALETTE_CHANNELS + 2]! * PALETTE_CHANNEL_SCALE})`,
    );
    this.textures = scene.textures.map((texture) => {
      const canvas = document.createElement('canvas');
      canvas.width = texture.width;
      canvas.height = texture.height;

      const context = canvas.getContext('2d')!;
      const image = context.createImageData(texture.width, texture.height);
      texture.pixels.forEach((color, index) => {
        if (color === 0) {
          return;
        }

        for (let channel = 0; channel < PALETTE_CHANNELS; channel++) {
          image.data[index * 4 + channel] =
            palette[color * PALETTE_CHANNELS + channel]! * PALETTE_CHANNEL_SCALE;
        }

        image.data[index * 4 + 3] = 255;
      });
      context.putImageData(image, 0, 0);

      return canvas;
    });
    scene.textures.forEach((texture, index) => {
      const key = `${texture.object}:${texture.triangle}`;
      const textures = this.attachedTextures.get(key) ?? [];
      textures.push({ texture, image: this.textures[index]! });
      this.attachedTextures.set(key, textures);
    });
  }

  draw(options: { context: CanvasRenderingContext2D; center: Position }): void {
    const { context, center } = options;
    const ordered = this.scene.objects
      .map((object, index) => ({
        object,
        index,
        distance: (object.x - center.x) ** 2 + (object.y - center.y) ** 2,
      }))
      .sort((a, b) => b.distance - a.distance);

    for (const { object, index } of ordered) {
      const points = object.vertices.map((vertex) => ({
        x: Math.round(
          center.x + (FIXED_POINT_SCALE * (object.x - center.x) + vertex.x) / vertex.depth,
        ),
        y: Math.round(
          center.y + (FIXED_POINT_SCALE * (object.y - center.y) + vertex.y) / vertex.depth,
        ),
      }));
      object.triangles.forEach((triangle, triangleIndex) => {
        const a = points[triangle.vertices[0]]!;
        const b = points[triangle.vertices[1]]!;
        const c = points[triangle.vertices[2]]!;

        if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) <= 0) {
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.lineTo(c.x, c.y);
          context.closePath();
          context.fillStyle =
            triangle.color >= 129 && triangle.color <= 131
              ? '#00000050'
              : this.colors[
                  triangle.color === 128 || triangle.color === 138 ? 112 : triangle.color
                ]!;
          context.fill();
        }

        for (const { texture, image } of this.attachedTextures.get(`${index}:${triangleIndex}`) ??
          []) {
          const x = Math.round(
            center.x + (texture.x - FIXED_POINT_SCALE * center.x) / texture.depth,
          );

          const y = Math.round(
            center.y + (texture.y - FIXED_POINT_SCALE * center.y) / texture.depth,
          );
          context.drawImage(image, x, y);
        }
      });
    }
  }
}
