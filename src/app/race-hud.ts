import type { GameConfig } from '../config/schemas/game';
import type { Racer, RaceState } from '../race/types';
import { standings } from '../race/progress';
import { element } from './view';

interface RaceHudOptions {
  state: RaceState;
  config: GameConfig;
  laps: number;
  spectate: boolean;
}

const html = (id: string) => element(id, HTMLElement);
const button = (id: string) => element(id, HTMLButtonElement);

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

export function updateRaceHud(options: RaceHudOptions): void {
  const { state, config, laps, spectate } = options;
  const player = state.racers[0]!;
  html('lap').textContent = `${Math.min(player.completedLaps + 1, laps)} / ${laps}`;
  html('time').textContent = formatTime(state.elapsed);
  html('best').textContent = player.bestLap === null ? '—' : formatTime(player.bestLap);

  const health = Math.round((player.health / config.combat.health) * 100);
  const turbo = Math.round((player.turbo / config.physics.turboCapacity) * 100);
  element('health', HTMLMeterElement).value = health;
  element('turbo', HTMLMeterElement).value = turbo;
  html('health-value').textContent = `${health}%`;
  html('turbo-value').textContent = `${turbo}%`;
  html('ammo').textContent = String(player.ammo);
  html('mines').textContent = String(player.mines);
  html('standings').replaceChildren(
    ...standings(state).map((racer, index) => {
      const row = document.createElement('li');
      row.style.setProperty('--racer-color', config.display.colors[racer.id]!);
      row.textContent = `${index + 1}  ${racer.name}`;

      const status = document.createElement('span');
      status.textContent = racerStatus(racer);
      row.append(status);

      return row;
    }),
  );
  html('race-status').textContent = raceStatus(state, spectate);

  html('overlay').hidden = state.phase === 'racing';
  button('resume').hidden = state.phase !== 'paused';
  button('pause').textContent = state.phase === 'paused' ? 'Resume' : 'Pause';
  button('pause').disabled = state.phase === 'finished';

  if (state.phase === 'countdown') {
    html('overlay-kicker').textContent = 'ENGINES READY';
    html('overlay-title').textContent = String(Math.ceil(state.countdown));
    html('overlay-detail').textContent = 'Hold accelerate. Find your line.';
  }

  if (state.phase === 'paused') {
    html('overlay-kicker').textContent = 'TAKE A BREATHER';
    html('overlay-title').textContent = 'Race paused';
    html('overlay-detail').textContent = 'Your race is right where you left it.';
  }

  if (state.phase === 'finished') {
    const position = standings(state).findIndex((racer) => racer.id === 0) + 1;
    html('overlay-kicker').textContent = 'CHEQUERED FLAG';
    html('overlay-title').textContent = finishTitle({
      player,
      position,
      racers: state.racers.length,
    });
    html('overlay-detail').textContent =
      `Race time ${formatTime(state.elapsed)} · ${player.completedLaps} laps completed`;
  }

  element('race-canvas', HTMLCanvasElement).dataset.phase = state.phase;
}

function racerStatus(racer: Racer): string {
  if (racer.health <= 0) {
    return 'OUT';
  }

  return racer.finishedAt !== null ? 'FIN' : `L${racer.completedLaps + 1}`;
}

function raceStatus(state: RaceState, spectate: boolean): string {
  switch (state.phase) {
    case 'racing':
      return spectate ? 'Spectating · AI driving' : 'Race in progress';
    case 'countdown':
      return 'Get ready';
    case 'paused':
      return 'Race paused';
    case 'finished':
      return 'Race finished';
  }
}

interface FinishTitleOptions {
  player: Racer;
  position: number;
  racers: number;
}

function finishTitle(options: FinishTitleOptions): string {
  const { player, position, racers } = options;

  if (player.health <= 0) {
    return 'Wrecked.';
  }

  if (player.finishedAt === null) {
    return 'Time is up.';
  }

  return position === 1 ? 'First across the line.' : `Finished ${position} of ${racers}`;
}
