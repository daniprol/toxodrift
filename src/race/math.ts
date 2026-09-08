import type { Position } from './types';

export const DEGREES_TO_RADIANS = Math.PI / 180;

export function normalizeDirection(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Original coordinates: 0° north, 90° west, increasing counterclockwise. */
export function forward(direction: number): Position {
  const angle = direction * DEGREES_TO_RADIANS;

  return { x: -Math.sin(angle), y: -Math.cos(angle) };
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
