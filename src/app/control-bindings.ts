import type { GameConfig } from '../config/schemas/game';
import { element } from './view';

const ACTION_LABELS: Record<keyof GameConfig['controls'], string> = {
  accelerate: 'Accelerate',
  brake: 'Brake / reverse',
  left: 'Steer left',
  right: 'Steer right',
  turbo: 'Turbo',
  fire: 'Fire',
  mine: 'Mine',
  recover: 'Recover',
  pause: 'Pause',
};

function keyLabel(code: string): string {
  return code.replace(/^(Key|Digit)/, '').replace(/(Left|Right)$/, ' $1');
}

/** Visible help and the canvas accessible name describe the same active bindings. */
export function showControlBindings(controls: GameConfig['controls']): void {
  const instructions: string[] = [];
  const rows = (Object.keys(ACTION_LABELS) as (keyof typeof controls)[]).map((action) => {
    const keys = controls[action].map(keyLabel).join(' / ');
    const label = ACTION_LABELS[action];
    const row = document.createElement('span');
    const keyboard = document.createElement('kbd');

    keyboard.textContent = keys;
    row.append(keyboard, ` ${label}`);
    instructions.push(`${label}: ${keys}`);

    return row;
  });

  element('controls', HTMLElement).replaceChildren(...rows);
  element('race-canvas', HTMLCanvasElement).setAttribute(
    'aria-label',
    `Race track. ${instructions.join('. ')}.`,
  );
}
