import { Joystick } from './joystick';
import { IDLE_INPUT, type DriverInput, type DrivingButton } from '../race/types';

interface TouchOptions {
  root: HTMLElement;
  onRecover: () => void;
}

/** Pointer capture supports simultaneous fingers and reliable release outside a button. */
export class TouchControls {
  private readonly joystick: Joystick;
  private readonly held = new Map<number, { action: DrivingButton; button: HTMLButtonElement }>();
  private readonly lifetime = new AbortController();

  constructor(options: TouchOptions) {
    const signal = this.lifetime.signal;
    this.joystick = new Joystick(options.root.querySelector<HTMLElement>('#joystick')!);
    for (const button of options.root.querySelectorAll<HTMLButtonElement>('[data-drive]')) {
      const action = button.dataset.drive as DrivingButton;
      button.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          this.held.set(event.pointerId, { action, button });
          button.classList.add('is-held');
        },
        { signal },
      );
      const release = (event: PointerEvent) => {
        this.held.delete(event.pointerId);
        if (![...this.held.values()].some((entry) => entry.button === button)) {
          button.classList.remove('is-held');
        }
      };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        button.addEventListener(event, release, { signal });
      }
      button.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    }
    options.root
      .querySelector('#recover')!
      .addEventListener('click', options.onRecover, { signal });
  }

  read(): DriverInput {
    const input: DriverInput = { ...IDLE_INPUT };
    for (const { action } of this.held.values()) {
      input[action] = true;
    }
    const joystick = this.joystick.read();
    input.accelerate ||= joystick.accelerate;
    input.brake ||= joystick.brake;
    input.steering = joystick.steering ?? 0;
    return input;
  }

  clear(): void {
    this.joystick.clear();
    const entries = [...this.held.entries()];
    this.held.clear();
    for (const [pointer, { button }] of entries) {
      button.classList.remove('is-held');
      if (button.hasPointerCapture(pointer)) {
        button.releasePointerCapture(pointer);
      }
    }
  }

  dispose(): void {
    this.clear();
    this.lifetime.abort();
    this.joystick.dispose();
  }
}
