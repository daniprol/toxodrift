import { z } from 'zod';

const PositiveNumberSchema = z.number().finite().positive();
const RatioSchema = z.number().min(0).max(1);
const KeyBindingsSchema = z.array(z.string().min(1)).min(1);

export const CarSchema = z
  .object({
    id: z.string().regex(/^[a-z]+$/),
    name: z.string().min(1),
    sprite: z.string().regex(/^[a-z]+$/),
    engine: PositiveNumberSchema,
    engineSample: z.number().int().positive(),
    steering: PositiveNumberSchema.describe('Degrees per original simulation tick'),
    tireSlip: RatioSchema,
    size: PositiveNumberSchema,
    armor: z.number().min(0).max(900),
    gunDamage: PositiveNumberSchema,
    speedMph: PositiveNumberSchema,
  })
  .strict();

export type CarDefinition = z.infer<typeof CarSchema>;

const RaceConfigSchema = z
  .object({
    tickRate: z.number().int().min(30).max(240),
    laps: z.number().int().min(1).max(99),
    countdownSeconds: z.number().min(0).max(10),
    maxRaceSeconds: PositiveNumberSchema,
    defaultTrack: z.string(),
    defaultCar: z.string(),
    opponents: z.number().int().min(0).max(3),
    weapons: z.boolean(),
  })
  .strict();

const PhysicsConfigSchema = z
  .object({
    drag: RatioSchema,
    throttleDrag: RatioSchema,
    acceleration: PositiveNumberSchema,
    turboAcceleration: PositiveNumberSchema,
    accelerationDivisor: PositiveNumberSchema,
    brakeDivisor: PositiveNumberSchema,
    verticalScale: PositiveNumberSchema,
    slipDivisor: PositiveNumberSchema,
    steeringMemory: PositiveNumberSchema,
    steeringBuild: PositiveNumberSchema,
    steeringDecay: PositiveNumberSchema,
    collisionRadius: PositiveNumberSchema,
    wallBounce: RatioSchema,
    collisionDamage: z.number().nonnegative(),
    terrainDrag: z.array(RatioSchema).length(16),
    turboCapacity: PositiveNumberSchema,
    turboDrain: PositiveNumberSchema,
    turboRecharge: z.number().nonnegative(),
  })
  .strict();

const CombatConfigSchema = z
  .object({
    health: PositiveNumberSchema,
    ammo: z.number().int().nonnegative(),
    mines: z.number().int().nonnegative(),
    gunInterval: PositiveNumberSchema,
    gunAmmoCost: PositiveNumberSchema,
    weaponSafetyTicks: z.number().int().nonnegative(),
    gunRange: PositiveNumberSchema,
    mineInterval: PositiveNumberSchema,
    mineArmSeconds: PositiveNumberSchema,
    mineRadius: PositiveNumberSchema,
    mineDamage: PositiveNumberSchema,
    pickupRespawnSeconds: PositiveNumberSchema,
    pickupRadius: PositiveNumberSchema,
    repairAmount: PositiveNumberSchema,
  })
  .strict();

const AiConfigSchema = z
  .object({
    lookAhead: PositiveNumberSchema,
    sensorAngle: PositiveNumberSchema,
    leftThreshold: z.number(),
    rightThreshold: z.number(),
    stuckSeconds: PositiveNumberSchema,
    recoverySeconds: PositiveNumberSchema,
    cornerSpeedFactor: PositiveNumberSchema,
    brakingMargin: z.number().min(1),
  })
  .strict();

const DisplayConfigSchema = z
  .object({
    width: z.number().int().min(320).max(1920),
    height: z.number().int().min(200).max(1080),
    cameraLead: z.number().nonnegative(),
    maxFrameSeconds: PositiveNumberSchema,
    colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).length(4),
  })
  .strict();

const AudioConfigSchema = z
  .object({
    enabled: z.boolean(),
    musicVolume: RatioSchema,
    effectsVolume: RatioSchema,
    engineVolume: RatioSchema,
    readySample: z.number().int().positive(),
    finishSample: z.number().int().positive(),
    gunSample: z.number().int().positive(),
    collisionSample: z.number().int().positive(),
  })
  .strict();

const ControlsConfigSchema = z
  .object({
    accelerate: KeyBindingsSchema,
    brake: KeyBindingsSchema,
    left: KeyBindingsSchema,
    right: KeyBindingsSchema,
    turbo: KeyBindingsSchema,
    fire: KeyBindingsSchema,
    mine: KeyBindingsSchema,
    pause: KeyBindingsSchema,
    recover: KeyBindingsSchema,
  })
  .strict();

export const GameConfigSchema = z
  .object({
    $schema: z.string().optional(),
    race: RaceConfigSchema,
    physics: PhysicsConfigSchema,
    combat: CombatConfigSchema,
    ai: AiConfigSchema,
    display: DisplayConfigSchema,
    audio: AudioConfigSchema,
    controls: ControlsConfigSchema,
    cars: z.array(CarSchema).min(1),
  })
  .strict()
  .superRefine((config, context) => {
    if (!config.cars.some((car) => car.id === config.race.defaultCar)) {
      context.addIssue({
        code: 'custom',
        message: 'defaultCar must name a configured car',
        path: ['race', 'defaultCar'],
      });
    }

    if (new Set(config.cars.map((car) => car.id)).size !== config.cars.length) {
      context.addIssue({ code: 'custom', message: 'Car IDs must be unique', path: ['cars'] });
    }
  });

export type GameConfig = z.infer<typeof GameConfigSchema>;
