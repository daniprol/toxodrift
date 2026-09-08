import { DAMAGE_SPRITES, type HudAssetName } from '../assets/interface';
import type { RaceAssets } from '../assets/browser-loader';
import type { GameConfig } from '../config/schemas/game';
import { clamp } from '../race/math';
import { standings } from '../race/progress';
import type { RaceSetup, RaceState } from '../race/types';

const WIDTH = 64;
const HEIGHT = 200;
interface InstrumentOptions {
  canvas: HTMLCanvasElement;
  assets: Pick<RaceAssets, 'palette' | 'hud'>;
  config: GameConfig;
  setup: RaceSetup;
}

/** Original 64×200 instrument strip. Blit indexed art before one palette conversion.
 * Layout and sprite offsets follow dRally race___40f48h.c (MIT).
 */
export class InstrumentRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly pixels = new Uint8Array(WIDTH * HEIGHT);
  private readonly image: ImageData;
  private readonly palette: Uint8Array;

  constructor(private readonly options: InstrumentOptions) {
    const context = options.canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D is unavailable');
    }
    this.context = context;
    this.image = context.createImageData(WIDTH, HEIGHT);
    this.palette = options.assets.palette.slice();
    // Match the four original paint ramps to the cars used by this race.
    options.config.display.colors.slice(0, 4).forEach((color, racer) => {
      const rgb = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
      for (let shade = 0; shade < 10; shade++) {
        for (let channel = 0; channel < 3; channel++) {
          this.palette[(15 + racer * 10 + shade) * 3 + channel] = Math.round(
            (rgb[channel]! * (0.25 + shade / 12)) / 4,
          );
        }
      }
    });
  }

  draw(state: RaceState): void {
    this.pixels.fill(0);
    this.drawPlayer(state);
    this.drawStandings(state);
    this.present();
  }

  private drawPlayer(state: RaceState): void {
    const { config, setup } = this.options;
    const player = state.racers[0]!;
    this.blit('boards', 64, 104, 0, 0, setup.weapons ? 0 : 0x8800, false);
    this.maskGauges(
      clamp(Math.abs(player.speed) / player.car.engine, 0, 1),
      player.turbo / config.physics.turboCapacity,
    );
    this.blit(
      DAMAGE_SPRITES[player.car.sprite]!,
      64,
      21,
      0,
      50,
      Math.min(5, Math.floor((1 - player.health / config.combat.health) * 5)) * 64 * 21,
      false,
    );
    this.text(player.name, 3, 2);
    const damage = Math.round(100 - (player.health / config.combat.health) * 100);
    this.number(damage, 22 - String(damage).length * 8, 71, true);
    if (setup.weapons) {
      const ammoWidth = Math.round(55 * clamp(player.ammo / Math.max(1, config.combat.ammo), 0, 1));
      this.clear(4 + ammoWidth, 47, 55 - ammoWidth, 3);
      for (let mine = 0; mine < Math.min(8, player.mines); mine++) {
        this.blit('sidebom1', 8, 6, mine * 8, 41);
      }
    } else {
      const time = Math.max(0, state.elapsed - player.lapStartedAt);
      this.text(`${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, '0')}`, 5, 44);
    }
  }

  private drawStandings(state: RaceState): void {
    const { config, setup } = this.options;
    const order = standings(state);
    if (state.racers.length > 4) {
      const lap = Math.min(setup.laps, state.racers[0]!.completedLaps + 1);
      if (setup.laps < 10) {
        this.number(lap, 2, 90);
        this.number(setup.laps, 21, 90);
      } else {
        this.clear(1, 90, 31, 10);
        this.text(`${lap}/${setup.laps}`, 1, 93);
      }
      this.text(
        `${order.findIndex((racer) => racer.id === state.racers[0]!.id) + 1}/${order.length}`,
        36,
        78,
      );
      order.forEach((racer, index) => {
        const y = 104 + index * 16;
        this.text(`${index + 1} ${racer.name}`.slice(0, 10), 2, y);
        this.text(
          racer.health <= 0
            ? 'OUT'
            : racer.finishedAt !== null
              ? 'FIN'
              : `L${racer.completedLaps + 1}`,
          40,
          y + 7,
        );
      });
      return;
    }
    state.racers.forEach((racer, index) => {
      const position = order.findIndex((entry) => entry.id === racer.id);
      if (index > 0) {
        this.blit('boards', 64, 32, 0, 72 + index * 32, index * 0x2200 + 0x1a00, false);
        this.drawOpponentDamage(racer.health / config.combat.health, 72 + index * 32);
        this.text(racer.name, 3, 74 + index * 32);
      }
      const size = index === 0 ? 32 : 24;
      this.blit(
        index === 0 ? 'own-num1' : 'oth-num1',
        size,
        size,
        index === 0 ? 32 : 40,
        index === 0 ? 72 : 80 + index * 32,
        position * 7 * size * size,
        false,
      );
      const lap = Math.min(setup.laps, racer.completedLaps + 1);
      if (setup.laps < 10) {
        this.number(lap, index === 0 ? 2 : 4, 90 + index * 32);
        this.number(setup.laps, index === 0 ? 21 : 26, 90 + index * 32);
      } else {
        this.clear(1, 90 + index * 32, 31, 10);
        this.text(`${lap}/${setup.laps}`, 1, 93 + index * 32);
      }
      if (racer.health <= 0) {
        this.blit('rasti1', 64, 32, 0, 72 + index * 32);
      } else if (racer.finishedAt !== null) {
        this.blit('goalnum2', 22, 28, 4, 78 + index * 32);
      }
    });
  }

  private present(): void {
    for (let i = 0; i < this.pixels.length; i++) {
      for (let channel = 0; channel < 3; channel++) {
        this.image.data[i * 4 + channel] = this.palette[this.pixels[i]! * 3 + channel]! * 4;
      }
      this.image.data[i * 4 + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
  }

  /** Original DAMSLID overlays the depleted portion of each opponent's name strip. */
  private drawOpponentDamage(health: number, y: number): void {
    const damagedWidth = Math.trunc(WIDTH - Math.ceil(clamp(health, 0, 1) * 100) / 1.57);
    const start = WIDTH - damagedWidth;
    const source = this.options.assets.hud.get('damslid')!;

    for (let row = 0; row < 9; row++) {
      this.pixels.set(
        source.subarray(row * WIDTH + start, (row + 1) * WIDTH),
        (y + row) * WIDTH + start,
      );
    }
  }

  private maskGauges(speed: number, turbo: number): void {
    for (let y = 8; y < 34; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const index = y * WIDTH + x;
        const sweep = Math.atan2(33 - y, 32 - x) / Math.PI;
        if (this.pixels[index]! >= 64 && this.pixels[index]! < 80 && sweep > speed) {
          this.pixels[index] = 0;
        }
      }
    }
    const remaining = Math.round(clamp(turbo, 0, 1) * 58);
    for (let y = 34; y < 41; y++) {
      for (let x = 4 + remaining; x < 62; x++) {
        if (this.pixels[y * WIDTH + x]! >= 64) {
          this.pixels[y * WIDTH + x] = 0;
        }
      }
    }
  }

  private clear(x: number, y: number, width: number, height: number): void {
    for (let row = y; row < y + height; row++) {
      this.pixels.fill(0, row * WIDTH + x, row * WIDTH + x + width);
    }
  }

  private text(value: string, x: number, y: number): void {
    for (const character of value.toUpperCase().slice(0, 10)) {
      const glyph = character.charCodeAt(0) - 32;
      if (glyph >= 0 && glyph < 64) {
        this.blit('smalfo4a', 6, 6, x, y, glyph * 36);
      }
      x += 6;
    }
  }

  private number(value: number, x: number, y: number, percent = false): void {
    for (const digit of String(value)) {
      this.blit('bignum6', 8, 10, x, y, Number(digit) * 80);
      x += 8;
    }
    if (percent) {
      this.blit('bignum6', 8, 10, x, y, 800);
    }
  }

  private blit(
    name: HudAssetName,
    width: number,
    height: number,
    x: number,
    y: number,
    offset = 0,
    transparent = true,
  ): void {
    const source = this.options.assets.hud.get(name)!;
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const pixel = source[offset + row * width + column]!;
        if (
          (!transparent || pixel !== 0) &&
          x + column >= 0 &&
          x + column < WIDTH &&
          y + row < HEIGHT
        ) {
          this.pixels[(y + row) * WIDTH + x + column] = pixel;
        }
      }
    }
  }
}
