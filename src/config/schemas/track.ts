import { z } from 'zod';

const PositionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const TrackSchema = z
  .object({
    id: z.string().regex(/^tr[0-9]r?$/),
    name: z.string().min(1),
    width: z.number().int().positive().max(4096).multipleOf(4),
    height: z.number().int().positive().max(4096).multipleOf(4),
    zones: z.number().int().min(1).max(255),
    starts: z.array(PositionSchema.extend({ direction: z.number().min(0).lt(360) })).length(4),
    pickups: z.array(PositionSchema).max(16),
    drive: z.array(z.number().finite()).length(512),
  })
  .strict();

export type TrackDefinition = z.infer<typeof TrackSchema>;

export const ManifestSchema = z
  .object({ version: z.literal(1), tracks: z.array(TrackSchema).min(1) })
  .strict();

export type AssetManifest = z.infer<typeof ManifestSchema>;
