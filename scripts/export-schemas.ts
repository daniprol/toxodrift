import { ServerConfigSchema } from '../server/src/config';
import { MultiplayerConfigSchema } from '../src/network/servers';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { GameConfigSchema } from '../src/config/schemas/game';

await mkdir('public/config/schemas', { recursive: true });
await writeFile(
  'public/config/schemas/game.schema.json',
  JSON.stringify(z.toJSONSchema(GameConfigSchema), null, 2) + '\n',
);

for (const [name, schema] of [
  ['multiplayer', MultiplayerConfigSchema],
  ['server', ServerConfigSchema],
] as const) {
  await writeFile(
    `public/config/schemas/${name}.schema.json`,
    JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n',
  );
}
