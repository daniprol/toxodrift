import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { GameConfigSchema } from '../src/config/schemas/game';

await mkdir('public/config/schemas', { recursive: true });
await writeFile(
  'public/config/schemas/game.schema.json',
  JSON.stringify(z.toJSONSchema(GameConfigSchema), null, 2) + '\n',
);
