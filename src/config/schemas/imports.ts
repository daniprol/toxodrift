import { z } from 'zod';

export const AssetDownloadSchema = z
  .object({
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    installerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const TrackCatalogSchema = z.array(
  z
    .object({
      id: z.string().regex(/^tr[0-9]$/),
      name: z.string(),
      alternate: z.string().optional(),
    })
    .strict(),
);
