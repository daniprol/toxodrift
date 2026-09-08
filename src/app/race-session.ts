import { TouchControls } from '../platform/touch-controls';
import { InstrumentRenderer } from '../rendering/instrument-renderer';
import { element } from './view';
import { DRIVING_BUTTONS, type DriverInput } from '../race/types';
import type { RaceAssets } from '../assets/browser-loader';
import type { GameConfig } from '../config/schemas/game';
import { FixedStepClock } from '../platform/fixed-step';
import { Keyboard } from '../platform/keyboard';
import { RaceAudio } from '../platform/race-audio';
import { Race } from '../race/race';
import type { RaceSetup } from '../race/types';
import { RaceRenderer } from '../rendering/race-renderer';
import { updateRaceHud } from './race-hud';

const HUD_REFRESH_MS = 100;

interface RaceSessionOptions {
  canvas: HTMLCanvasElement;
  assets: RaceAssets;
  config: GameConfig;
  setup: RaceSetup;
}

/** Owns one running race, including its frame loop and browser subscriptions. */
export class RaceSession {
  private readonly touch: TouchControls;
  private readonly instruments: InstrumentRenderer;
  private readonly race: Race;
  private readonly renderer: RaceRenderer;
  private readonly keyboard: Keyboard;
  private readonly audio: RaceAudio;
  private readonly clock: FixedStepClock;
  private readonly lifetime = new AbortController();

  private frameId = 0;

  private lastHudUpdate = 0;

  constructor(private readonly options: RaceSessionOptions) {
    const { assets, config, canvas, setup } = options;

    this.race = new Race({ track: assets.track, config, ...setup });
    this.renderer = new RaceRenderer({ canvas, assets, config });
    this.audio = new RaceAudio({
      config,
      trackId: assets.track.definition.id,
      car: this.race.state.racers[0]!.car,
    });
    this.clock = new FixedStepClock({
      tickRate: config.race.tickRate,
      maxFrameSeconds: config.display.maxFrameSeconds,
      step: () => this.race.step(this.readInput()),
    });
    this.keyboard = new Keyboard({
      target: window,
      controls: config.controls,
      onPause: () => this.togglePause(),
      onRecover: () => this.race.recoverPlayer(),
      onBlur: () => this.pauseWhenInactive(),
    });

    document.addEventListener('fullscreenchange', () => canvas.focus(), {
      signal: this.lifetime.signal,
    });

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.pauseWhenInactive();
        }
      },
      { signal: this.lifetime.signal },
    );

    this.touch = new TouchControls({
      root: element('touch-controls', HTMLElement),
      onRecover: () => this.race.recoverPlayer(),
    });
    this.instruments = new InstrumentRenderer({
      canvas: element('hud-canvas', HTMLCanvasElement),
      assets,
      config,
      setup,
    });
    const orientation = matchMedia('(orientation: portrait) and (any-pointer: coarse)');
    orientation.addEventListener(
      'change',
      () => {
        if (orientation.matches) {
          this.pauseWhenInactive();
        }
      },
      { signal: this.lifetime.signal },
    );
    if (orientation.matches) {
      this.pauseWhenInactive();
    }
    for (const button of element('touch-controls', HTMLElement).querySelectorAll<HTMLElement>(
      '[data-weapon]',
    )) {
      button.hidden = !setup.weapons;
    }
    this.updateHud();
    canvas.focus();
    this.frameId = requestAnimationFrame(this.frame);
  }

  togglePause(): void {
    this.race.togglePause();
    this.keyboard.clear();
    this.touch.clear();
    this.clock.reset();
    this.audio.update(this.race.state);
    this.updateHud();
    this.options.canvas.focus();
  }

  toggleMute(): boolean {
    this.options.canvas.focus();

    return this.audio.toggleMute();
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.lifetime.abort();
    this.keyboard.dispose();
    this.touch.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }

  private pauseWhenInactive(): void {
    if (this.race.state.phase === 'racing' || this.race.state.phase === 'countdown') {
      this.togglePause();
    }
  }

  private updateHud(): void {
    const phase = this.race.state.phase;
    element('touch-controls', HTMLElement).hidden =
      (this.options.setup.spectate ?? false) || phase === 'paused' || phase === 'finished';
    updateRaceHud({
      state: this.race.state,
      config: this.options.config,
      laps: this.options.setup.laps,
      spectate: this.options.setup.spectate ?? false,
    });
  }

  private readInput(): DriverInput {
    const input = this.keyboard.read();
    const touch = this.touch.read();
    for (const action of DRIVING_BUTTONS) {
      input[action] ||= touch[action];
    }
    if (!input.left && !input.right) {
      input.steering = touch.steering ?? 0;
    }
    return input;
  }

  private frame = (timestamp: number): void => {
    this.clock.advance(timestamp);
    this.renderer.draw(this.race.state);
    this.instruments.draw(this.race.state);
    this.audio.update(this.race.state);

    if (timestamp - this.lastHudUpdate >= HUD_REFRESH_MS) {
      this.updateHud();
      this.lastHudUpdate = timestamp;
    }

    this.frameId = requestAnimationFrame(this.frame);
  };
}
