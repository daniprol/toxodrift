import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { importInterface } from '../../scripts/lib/import-interface';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

/** Small authored BPA archives exercise validation through the real import entry point. */
async function menuArchive(entries: Record<string, Uint8Array>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'toxodrift-interface-'));
  directories.push(path);
  const files = Object.entries(entries);
  const archive = new Uint8Array(4339 + files.reduce((size, [, bytes]) => size + bytes.length, 0));
  const view = new DataView(archive.buffer);
  view.setUint32(0, files.length, true);
  let offset = 4339;
  files.forEach(([name, bytes], index) => {
    const entry = 4 + index * 17;
    [...name].forEach((character, column) => {
      archive[entry + column] = (character.charCodeAt(0) + 117 - 3 * column) & 255;
    });
    view.setUint32(entry + 13, bytes.length, true);
    archive.set(bytes, offset);
    offset += bytes.length;
  });
  await writeFile(join(path, 'MENU.BPA'), archive);
  return path;
}

it('rejects a truncated menu palette before exporting artwork', async () => {
  const path = await menuArchive({ 'MENU.PAL': new Uint8Array(767) });
  await expect(importInterface(path, path)).rejects.toThrow(
    'Invalid MENU.PAL: expected 768 bytes, received 767',
  );
});

it('rejects a decoded menu image with the wrong dimensions', async () => {
  const path = await menuArchive({
    'MENU.PAL': new Uint8Array(768),
    'MENUBG5.BPK': new Uint8Array([1, 1, 2]), // LZW reset/end: a valid empty plane.
  });
  await expect(importInterface(path, path)).rejects.toThrow(
    'Invalid MENUBG5.BPK: expected 307200 pixels, received 0',
  );
});
