import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const RaceSettingsSchema = z
  .object({
    trackId: z.string().regex(/^tr[0-9]r?$/),
    carId: z.string().regex(/^[a-z]+$/),
    participants: z.union([z.literal(2), z.literal(4), z.literal(6)]),
    ai: z.number().int().min(0).max(5),
    laps: z.number().int().min(1).max(99),
    weapons: z.boolean(),
  })
  .strict()
  .refine((settings) => settings.ai < settings.participants, 'At least one human slot is required');
export type RaceSettings = z.infer<typeof RaceSettingsSchema>;
export const InputSchema = z
  .object({
    sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    accelerate: z.boolean(),
    brake: z.boolean(),
    left: z.boolean(),
    right: z.boolean(),
    turbo: z.boolean(),
    fire: z.boolean(),
    mine: z.boolean(),
    steering: z.number().finite().min(-1).max(1).optional(),
  })
  .strict();
export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[\p{L}\p{N} _.-]+$/u);
export const PlayerScoreSchema = z.object({
  id: z.string().min(1),
  name: PlayerNameSchema,
  elo: z.number(),
  points: z.number().int().nonnegative(),
  races: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
});
export type PlayerScore = z.infer<typeof PlayerScoreSchema>;
export const RaceResultSchema = z.object({
  racerId: z.number().int().min(0).max(5),
  name: z.string(),
  position: z.number().int().min(1).max(6),
  finished: z.boolean(),
  eloDelta: z.number(),
  points: z.number().int().nonnegative(),
});
export type RaceResult = z.infer<typeof RaceResultSchema>;
export const RoomListingSchema = z.object({
  roomId: z.string().min(1),
  clients: z.number().int().min(0).max(6),
  maxClients: z.number().int().min(1).max(6),
  metadata: RaceSettingsSchema,
});
export type RoomListing = z.infer<typeof RoomListingSchema>;
