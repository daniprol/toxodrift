import { schema, t, type SchemaType } from '@colyseus/schema';
import type { RaceState } from '../race/types';

export const LobbyDriver = schema(
  {
    sessionId: t.string().default(''),
    name: t.string().default(''),
    racerId: t.uint8().default(0),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
  },
  'LobbyDriver',
);
export type LobbyDriver = SchemaType<typeof LobbyDriver>;

/** Only observable data is replicated. Physics internals remain inside the server Race. */
export const CarState = schema(
  {
    id: t.uint8().default(0),
    name: t.string().default(''),
    carId: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    direction: t.float32().default(0),
    speed: t.float32().default(0),
    health: t.float32().default(0),
    turbo: t.float32().default(0),
    ammo: t.float32().default(0),
    mines: t.uint16().default(0),
    completedLaps: t.uint16().default(0),
    checkpoint: t.uint16().default(0),
    lapStartedAt: t.float32().default(0),
    bestLap: t.float32().default(-1),
    finishedAt: t.float32().default(-1),
  },
  'CarState',
);
export type CarState = SchemaType<typeof CarState>;
export const WorldItem = schema(
  {
    x: t.float32().default(0),
    y: t.float32().default(0),
    kind: t.string().default(''),
    time: t.float32().default(0),
    owner: t.uint8().default(0),
    toX: t.float32().default(0),
    toY: t.float32().default(0),
  },
  'WorldItem',
);
export type WorldItem = SchemaType<typeof WorldItem>;
export const OnlineState = schema(
  {
    phase: t.string().default('lobby'),
    host: t.string().default(''),
    settings: t.string().default(''),
    tick: t.uint32().default(0),
    elapsed: t.float32().default(0),
    countdown: t.float32().default(0),
    drivers: t.array(LobbyDriver),
    cars: t.array(CarState),
    items: t.array(WorldItem),
    results: t.string().default(''),
  },
  'OnlineState',
);
export type OnlineState = SchemaType<typeof OnlineState>;
export function syncRace(target: OnlineState, source: RaceState): void {
  target.phase = source.phase;
  target.tick = source.tick;
  target.elapsed = source.elapsed;
  target.countdown = source.countdown;
  for (const racer of source.racers) {
    let car = target.cars[racer.id];
    if (!car) {
      car = new CarState();
      target.cars.push(car);
    }
    for (const key of [
      'id',
      'name',
      'x',
      'y',
      'direction',
      'speed',
      'health',
      'turbo',
      'ammo',
      'mines',
      'completedLaps',
      'checkpoint',
      'lapStartedAt',
    ] as const) {
      Object.assign(car, { [key]: racer[key] });
    }
    car.carId = racer.car.id;
    car.bestLap = racer.bestLap ?? -1;
    car.finishedAt = racer.finishedAt ?? -1;
  }
  const items = [
    ...source.mines.map((item) => ({ ...item, kind: 'mine', time: item.armedAt })),
    ...source.pickups.map((item) => ({ ...item, time: item.availableAt })),
    ...source.shots.map((item) => ({
      ...item.from,
      kind: 'shot',
      time: item.expiresAt,
      toX: item.to.x,
      toY: item.to.y,
    })),
  ];
  items.forEach((item, index) => {
    if (!target.items[index]) {
      target.items.push(new WorldItem());
    }
    Object.assign(target.items[index]!, { owner: 0, toX: 0, toY: 0 }, item);
  });
  target.items.splice(items.length);
}
