import type { DriverInput } from '../race/types';

const DEAD_ZONE = 0.18;
const TRAVEL = 44;

/** A thumb can land anywhere in the activation area. Only its subsequent drag drives. */
export class Joystick {
  private pointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private axes = { x: 0, y: 0 };
  private readonly lifetime = new AbortController();

  constructor(private readonly zone: HTMLElement) {
    const signal = this.lifetime.signal;
    zone.addEventListener(
      'pointerdown',
      (event) => {
        if (this.pointer !== null) {
          return;
        }
        event.preventDefault();
        this.pointer = event.pointerId;
        this.origin = { x: event.clientX, y: event.clientY };
        const bounds = zone.getBoundingClientRect();
        const centerX = Math.max(58, Math.min(bounds.width - 58, event.clientX - bounds.left));
        const centerY = Math.max(58, Math.min(bounds.height - 58, event.clientY - bounds.top));
        zone.style.setProperty('--stick-x', `${centerX}px`);
        zone.style.setProperty('--stick-y', `${centerY}px`);
        zone.classList.add('is-held');
        zone.setPointerCapture(event.pointerId);
      },
      { signal },
    );
    zone.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerId !== this.pointer) {
          return;
        }
        event.preventDefault();
        const dx = (event.clientX - this.origin.x) / TRAVEL;
        const dy = (event.clientY - this.origin.y) / TRAVEL;
        const magnitude = Math.max(1, Math.hypot(dx, dy));
        // Independent axes allow full steering and throttle together. The art stays circular.
        this.axes = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) };
        zone.style.setProperty('--thumb-x', `${(dx / magnitude) * TRAVEL}px`);
        zone.style.setProperty('--thumb-y', `${(dy / magnitude) * TRAVEL}px`);
      },
      { signal },
    );
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      zone.addEventListener(
        name,
        (event) => {
          if (event.pointerId === this.pointer) {
            this.clear();
          }
        },
        { signal },
      );
    }
    zone.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  }

  read(): Pick<DriverInput, 'accelerate' | 'brake' | 'steering'> {
    const { x, y } = this.axes;
    const steering =
      Math.abs(x) <= DEAD_ZONE ? 0 : (-Math.sign(x) * (Math.abs(x) - DEAD_ZONE)) / (1 - DEAD_ZONE);
    return { accelerate: y < -DEAD_ZONE, brake: y > DEAD_ZONE, steering };
  }

  clear(): void {
    const pointer = this.pointer;
    this.pointer = null;
    this.axes = { x: 0, y: 0 };
    this.zone.classList.remove('is-held');
    for (const name of ['--stick-x', '--stick-y', '--thumb-x', '--thumb-y']) {
      this.zone.style.removeProperty(name);
    }
    if (pointer !== null && this.zone.hasPointerCapture(pointer)) {
      this.zone.releasePointerCapture(pointer);
    }
  }

  dispose(): void {
    this.clear();
    this.lifetime.abort();
  }
}
