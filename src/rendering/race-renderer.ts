import { CAR_FRAME_SIZE, CAR_FRAME_DEGREES } from '../assets/formats';
import type { RaceAssets } from '../assets/browser-loader';
import type { GameConfig } from '../config/schemas/game';
import { clamp, forward } from '../race/math';
import type { Pickup, RaceState } from '../race/types';
import { createCarAtlas } from './sprites';
import { SceneryRenderer } from './scenery-renderer';

const PICKUP_APPEARANCE = {
  repair: { color: '#b8e15e', glyph: '+' },
  ammo: { color: '#eec273', glyph: '•' },
  turbo: { color: '#8bd7d0', glyph: '»' },
} satisfies Record<Pickup['kind'], { color: string; glyph: string }>;

interface RaceRendererOptions {
  canvas: HTMLCanvasElement;
  assets: RaceAssets;
  config: GameConfig;
}

export class RaceRenderer {
  private readonly scenery: SceneryRenderer;
  private readonly context: CanvasRenderingContext2D;
  private readonly atlases = new Map<string, HTMLCanvasElement>();

  constructor(private readonly options: RaceRendererOptions) {
    const { canvas, config, assets } = options;
    canvas.width = config.display.width;
    canvas.height = config.display.height;

    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      throw new Error('This browser does not support Canvas 2D');
    }

    this.context = context;
    this.scenery = new SceneryRenderer(assets.scenery, assets.palette);
    context.imageSmoothingEnabled = false;

    for (const car of config.cars) {
      for (const color of config.display.colors) {
        this.atlases.set(
          `${car.id}:${color}`,
          createCarAtlas({
            pixels: assets.sprites.get(car.sprite)!,
            palette: assets.palette,
            color,
          }),
        );
      }
    }
  }

  draw(state: RaceState): void {
    const { assets, config, canvas } = this.options;
    const context = this.context;
    const player = state.racers[0]!;
    const heading = forward(player.direction);
    const cameraX = Math.round(
      clamp(
        player.x + heading.x * config.display.cameraLead - canvas.width / 2,
        0,
        Math.max(0, assets.track.definition.width - canvas.width),
      ),
    );

    const cameraY = Math.round(
      clamp(
        player.y + heading.y * config.display.cameraLead - canvas.height / 2,
        0,
        Math.max(0, assets.track.definition.height - canvas.height),
      ),
    );
    context.fillStyle = '#141611';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(-cameraX, -cameraY);
    context.drawImage(assets.image, 0, 0);
    this.drawPickups(state);
    this.drawMines(state);
    this.drawCars(state);
    this.drawShots(state);
    this.scenery.draw({
      context,
      center: { x: cameraX + canvas.width / 2, y: cameraY + canvas.height / 2 },
    });
    context.restore();
    this.drawMinimap(state);
  }

  private drawPickups(state: RaceState): void {
    const context = this.context;

    for (const pickup of state.pickups) {
      if (pickup.availableAt > state.elapsed) {
        continue;
      }

      const appearance = PICKUP_APPEARANCE[pickup.kind];
      context.fillStyle = '#20221a';
      context.fillRect(pickup.x - 6, pickup.y - 6, 12, 12);
      context.fillStyle = appearance.color;
      context.font = 'bold 12px monospace';
      context.textAlign = 'center';
      context.fillText(appearance.glyph, pickup.x, pickup.y + 4);
    }
  }

  private drawMines(state: RaceState): void {
    const context = this.context;

    for (const mine of state.mines) {
      context.fillStyle = state.elapsed >= mine.armedAt ? '#d9503e' : '#aa9a62';
      context.beginPath();
      context.arc(mine.x, mine.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  private drawCars(state: RaceState): void {
    const context = this.context;
    const { config } = this.options;

    for (const racer of state.racers) {
      const color = config.display.colors[racer.id]!;
      const atlas = this.atlases.get(`${racer.car.id}:${color}`)!;

      if (racer.health <= 0) {
        context.filter = 'grayscale(1) brightness(0.4)';
      }

      context.drawImage(
        atlas,
        Math.floor(racer.direction / CAR_FRAME_DEGREES) * CAR_FRAME_SIZE,
        0,
        CAR_FRAME_SIZE,
        CAR_FRAME_SIZE,
        Math.round(racer.x) - CAR_FRAME_SIZE / 2,
        Math.round(racer.y) - CAR_FRAME_SIZE / 2,
        CAR_FRAME_SIZE,
        CAR_FRAME_SIZE,
      );
      context.filter = 'none';
      context.fillStyle = color;
      context.font = 'bold 8px monospace';
      context.textAlign = 'center';
      context.fillText(racer.id === 0 ? 'YOU' : String(racer.id + 1), racer.x, racer.y - 24);

      if (racer.health < config.combat.health) {
        context.fillStyle = '#30170d';
        context.fillRect(racer.x - 12, racer.y + 22, 24, 2);
        context.fillStyle = color;
        context.fillRect(racer.x - 12, racer.y + 22, (24 * racer.health) / config.combat.health, 2);
      }
    }
  }

  private drawShots(state: RaceState): void {
    const context = this.context;
    context.strokeStyle = '#fff0a6';
    context.lineWidth = 1;

    for (const shot of state.shots) {
      context.beginPath();
      context.moveTo(shot.from.x, shot.from.y);
      context.lineTo(shot.to.x, shot.to.y);
      context.stroke();
    }
  }

  private drawMinimap(state: RaceState): void {
    const { assets, config, canvas } = this.options;
    const context = this.context;
    const mapHeight =
      (config.display.minimapWidth * assets.track.definition.height) /
      assets.track.definition.width;
    const mapX = canvas.width - config.display.minimapWidth - 12;
    context.fillStyle = '#121510cc';
    context.fillRect(mapX - 4, 8, config.display.minimapWidth + 8, mapHeight + 8);
    context.globalAlpha = 0.7;
    context.drawImage(assets.image, mapX, 12, config.display.minimapWidth, mapHeight);
    context.globalAlpha = 1;

    for (const racer of state.racers) {
      context.fillStyle = config.display.colors[racer.id]!;
      context.fillRect(
        mapX + (racer.x / assets.track.definition.width) * config.display.minimapWidth - 2,
        12 + (racer.y / assets.track.definition.height) * mapHeight - 2,
        4,
        4,
      );
    }
  }
}
