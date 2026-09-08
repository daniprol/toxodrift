import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseConfig } from '../src/config/parse';

import { AssetDownloadSchema } from '../src/config/schemas/imports';

const config = parseConfig({
  text: await readFile('config/assets.jsonc', 'utf8'),
  schema: AssetDownloadSchema,
  name: 'assets.jsonc',
});

const directory = resolve('.local/downloads');
const archive = resolve(directory, 'DeathRallyWin_10.zip');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
await mkdir(directory, { recursive: true });
await mkdir('.local/original', { recursive: true });

let existing: Buffer | undefined;
try {
  existing = await readFile(archive);
} catch {
  /* Download on first setup. */
}

if (!existing || digest(existing) !== config.sha256) {
  console.log('Downloading the 2009 freeware release (42 MB)…');

  const response = await fetch(config.url, { signal: AbortSignal.timeout(120000) });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (digest(bytes) !== config.sha256) {
    throw new Error('Download checksum mismatch');
  }

  await writeFile(`${archive}.partial`, bytes);
  await rename(`${archive}.partial`, archive);
}

const extract = (file: string, destination: string) => {
  try {
    execFileSync('7z', ['e', '-y', `-o${destination}`, file], { stdio: 'pipe' });
  } catch (error) {
    throw new Error(
      'Extraction failed. Install 7-Zip (7z) or place your existing BPA files in .local/original.',
      { cause: error },
    );
  }
};

extract(archive, directory);

const installer = resolve(directory, 'DeathRallyWin_10.exe');

if (digest(await readFile(installer)) !== config.installerSha256) {
  throw new Error('Installer checksum mismatch');
}

extract(installer, resolve('.local/original'));
console.log('Verified and extracted original files. The Windows executable was not run.');
