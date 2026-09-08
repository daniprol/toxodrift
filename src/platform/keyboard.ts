import type { GameConfig } from '../config/schemas/game';
import { DRIVING_BUTTONS, IDLE_INPUT, type DriverInput } from '../race/types';

interface KeyboardOptions {
  target: Window;
  controls: GameConfig['controls'];
  onPause: () => void;
  onRecover: () => void;
  onBlur: () => void;
}

export class Keyboard {
  private readonly pressed = new Set<string>();
  private readonly lifetime = new AbortController();

  constructor(private readonly options: KeyboardOptions) {
    const { target } = options;
    target.addEventListener('keydown', this.keyDown, { signal: this.lifetime.signal });
    target.addEventListener('keyup', this.keyUp, { signal: this.lifetime.signal });
    target.addEventListener(
      'blur',
      () => {
        this.clear();
        options.onBlur();
      },
      { signal: this.lifetime.signal },
    );
  }

  read(): DriverInput {
    const input = { ...IDLE_INPUT };

    for (const action of DRIVING_BUTTONS) {
      input[action] = this.options.controls[action].some((key) => this.pressed.has(key));
    }

    return input;
  }

  clear(): void {
    this.pressed.clear();
  }

  dispose(): void {
    this.clear();
    this.lifetime.abort();
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (
      event.target instanceof HTMLElement &&
      ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)
    ) {
      return;
    }

    if (!Object.values(this.options.controls).flat().includes(event.code)) {
      return;
    }

    event.preventDefault();
    this.pressed.add(event.code);

    if (event.repeat) {
      return;
    }

    if (this.options.controls.pause.includes(event.code)) {
      this.options.onPause();
    }

    if (this.options.controls.recover.includes(event.code)) {
      this.options.onRecover();
    }
  };

  private keyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };
}
