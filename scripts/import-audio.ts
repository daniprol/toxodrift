import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readBpa, requireAsset } from '../src/assets/bpa';
import { decodeCmf, decodeXmSamples, encodeWav } from '../src/assets/audio';
import { convertMusic } from './lib/music-converter';

const SOURCE = resolve(process.argv[2] ?? '.local/original');
const DESTINATION = resolve('public/assets/original');
const music = readBpa(await readFile(resolve(SOURCE, 'MUSICS.BPA')));
await mkdir('.local/audio', { recursive: true });
await mkdir(DESTINATION, { recursive: true });

for (const sample of decodeXmSamples(decodeCmf(requireAsset(music, 'GEN-EFE.CMF')))) {
  await writeFile(resolve(DESTINATION, `effect-${sample.id}.wav`), encodeWav(sample));
}

for (const id of ['men', ...Array.from({ length: 10 }, (_, index) => `tr${index}`)]) {
  const output = resolve(DESTINATION, `${id}-music.ogg`);
  const source = resolve('.local/audio', `${id}.s3m`);
  await writeFile(source, decodeCmf(requireAsset(music, `${id.toUpperCase()}-MUS.CMF`)));
  await convertMusic({ source, destination: output });
  console.log(`Rendered original soundtrack: ${id}`);
}
