import type { CarDefinition, GameConfig } from '../config/schemas/game';
import type { RaceState } from '../race/types';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/original/`;
const MINIMUM_ENGINE_RATE = 0.6;
const MAXIMUM_ENGINE_RATE = 2.5;
const COLLISION_COOLDOWN_SECONDS = 0.2;

interface RaceAudioOptions {
  config: GameConfig;
  trackId: string;
  car: CarDefinition;
}

/** Browser audio is an observer: audio failure can never stop the simulation. */
export class RaceAudio {
  private readonly music: HTMLAudioElement;
  private readonly engine: HTMLAudioElement;
  private readonly effects = new Set<HTMLAudioElement>();

  private previousPhase = '';

  private previousAmmo = Infinity;

  private previousHealth = Infinity;

  private lastCollision = -Infinity;
  private muted: boolean;

  constructor(private readonly options: RaceAudioOptions) {
    const { config, trackId, car } = options;
    this.muted = !config.audio.enabled;
    this.music = new Audio(`${ASSET_ROOT}${trackId.replace(/r$/, '')}-music.ogg`);
    this.music.loop = true;
    this.music.volume = config.audio.musicVolume;
    this.engine = new Audio(`${ASSET_ROOT}effect-${car.engineSample}.wav`);
    this.engine.loop = true;
    this.engine.volume = config.audio.engineVolume;
    this.engine.preservesPitch = false;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.previousPhase = '';

    if (this.muted) {
      this.pause();
    }

    return this.muted;
  }

  update(state: RaceState): void {
    const player = state.racers[0]!;

    if (state.phase !== this.previousPhase) {
      if (state.phase === 'paused' || state.phase === 'finished' || this.muted) {
        this.pause();
      } else {
        void this.music.play().catch(() => {});
        void this.engine.play().catch(() => {});
      }

      if (state.phase === 'countdown') {
        this.effect(this.options.config.audio.readySample);
      }

      if (state.phase === 'finished') {
        this.effect(this.options.config.audio.finishSample);
      }

      this.previousPhase = state.phase;
    }

    this.engine.playbackRate = Math.min(
      MAXIMUM_ENGINE_RATE,
      MINIMUM_ENGINE_RATE + Math.abs(player.speed) / player.car.engine,
    );

    if (player.ammo < this.previousAmmo && this.previousAmmo !== Infinity) {
      this.effect(this.options.config.audio.gunSample);
    }

    if (
      player.health < this.previousHealth &&
      this.previousHealth !== Infinity &&
      state.elapsed - this.lastCollision > COLLISION_COOLDOWN_SECONDS
    ) {
      this.effect(this.options.config.audio.collisionSample);
      this.lastCollision = state.elapsed;
    }

    this.previousAmmo = player.ammo;
    this.previousHealth = player.health;
  }

  dispose(): void {
    this.pause();
    this.music.removeAttribute('src');
    this.engine.removeAttribute('src');
    this.music.load();
    this.engine.load();
  }

  private pause(): void {
    this.music.pause();
    this.engine.pause();
    this.effects.forEach((effect) => {
      effect.pause();
      effect.removeAttribute('src');
    });
    this.effects.clear();
  }

  private effect(id: number): void {
    if (this.muted) {
      return;
    }

    const sound = new Audio(`${ASSET_ROOT}effect-${id}.wav`);
    sound.volume = this.options.config.audio.effectsVolume;
    this.effects.add(sound);
    sound.addEventListener('ended', () => this.effects.delete(sound), { once: true });
    void sound.play().catch(() => this.effects.delete(sound));
  }
}
