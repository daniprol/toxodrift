import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { convertMusic } from '../../scripts/lib/music-converter';

const conversion = vi.hoisted(() => ({ fail: false, calls: 0 }));

vi.mock('node:child_process', () => ({
  execFile: (
    _command: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null) => void,
  ) => {
    conversion.calls++;
    const output = args.at(-1)!;

    void writeFile(output, conversion.fail ? 'partial audio' : 'complete audio').then(() => {
      callback(conversion.fail ? new Error('Conversion interrupted') : null);
    });
  },
}));

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'toxodrift-audio-'));
  conversion.fail = false;
  conversion.calls = 0;
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('retries an interrupted conversion without caching or leaving partial audio', async () => {
  const options = { source: 'original.s3m', destination: join(directory, 'track.ogg') };
  conversion.fail = true;

  await expect(convertMusic(options)).rejects.toThrow('rerun pnpm assets:audio');
  expect(await readdir(directory)).toEqual([]);

  conversion.fail = false;
  await convertMusic(options);

  expect(await readFile(options.destination, 'utf8')).toBe('complete audio');
  expect(await readdir(directory)).toEqual(['track.ogg']);
  expect(conversion.calls).toBe(2);
});

it('reuses a completed conversion without running the external converter again', async () => {
  const options = { source: 'original.s3m', destination: join(directory, 'track.ogg') };
  await convertMusic(options);
  await convertMusic(options);

  expect(conversion.calls).toBe(1);
  expect(await readFile(options.destination, 'utf8')).toBe('complete audio');
});
