import type { CarDefinition, GameConfig } from '../config/schemas/game';
import type { TrackData } from '../assets/track';

export interface Position {
  x: number;
  y: number;
}

export interface DriverInput {
  /** Optional analog steering: -1 right, +1 left. Buttons remain the keyboard default. */
  steering?: number;
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  turbo: boolean;
  fire: boolean;
  mine: boolean;
}

export type DrivingButton = Exclude<keyof DriverInput, 'steering'>;

export const IDLE_INPUT: Readonly<Record<DrivingButton, boolean>> = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  turbo: false,
  fire: false,
  mine: false,
});

/** Boolean actions only; analog steering is composed separately. */
export const DRIVING_BUTTONS = Object.keys(IDLE_INPUT) as readonly DrivingButton[];

export interface Racer extends Position {
  id: number;
  name: string;
  car: CarDefinition;
  direction: number;
  speed: number;
  steeringMemory: number;
  slip: number;
  health: number;
  armor: number;
  velocity: Position;
  collisionVelocity: Position;
  collisionTurn: number;
  collisionCooldown: number;
  turbo: number;
  ammo: number;
  mines: number;
  gunCooldown: number;
  mineCooldown: number;
  completedLaps: number;
  checkpoint: number;
  lapStartedAt: number;
  bestLap: number | null;
  finishedAt: number | null;
  stuckTicks: number;
  recoveryTicks: number;
  lastSafePosition: Position;
  lastSafeDirection: number;
}

export interface Mine extends Position {
  owner: number;
  armedAt: number;
}

export interface Shot {
  from: Position;
  to: Position;
  expiresAt: number;
}

export interface Pickup extends Position {
  kind: 'repair' | 'ammo' | 'turbo';
  availableAt: number;
}

export type RacePhase = 'countdown' | 'racing' | 'paused' | 'finished';

export interface RaceState {
  phase: RacePhase;
  tick: number;
  elapsed: number;
  countdown: number;
  racers: Racer[];
  mines: Mine[];
  shots: Shot[];
  pickups: Pickup[];
  finishOrder: number[];
}

export interface RaceSetup {
  carId: string;
  laps: number;
  opponents: number;
  weapons: boolean;
  spectate?: boolean;
}

export interface RaceOptions extends RaceSetup {
  track: TrackData;
  config: GameConfig;
  /** Explicit human slots; absent slots use AI. Online races wait for all racers. */
  drivers?: { id: number; name: string; carId: string }[];
}
