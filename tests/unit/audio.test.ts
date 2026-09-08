import { expect, it } from 'vitest';
import { decodeCmf, decodeXmSamples, encodeWav } from '../../src/assets/audio';

it('decodes the position-dependent CMF cipher', () => {
  expect(new TextDecoder().decode(decodeCmf(new Uint8Array([178, 123, 192])))).toBe('Ext');
});

it('restores signed XM delta samples including 8-bit wraparound', () => {
  const instrument = 336;
  const headerSize = 263;
  const sampleHeader = instrument + headerSize;
  const bytes = new Uint8Array(sampleHeader + 40 + 3);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('Extended Module: '));
  view.setUint32(60, 276, true);
  view.setUint16(72, 1, true);
  view.setUint32(instrument, headerSize, true);
  view.setUint16(instrument + 27, 1, true);
  view.setUint32(instrument + 29, 40, true);
  view.setUint32(sampleHeader, 3, true);
  bytes.set([127, 1, 255], sampleHeader + 40);

  const [sample] = decodeXmSamples(bytes);

  expect([...sample!.pcm]).toEqual([32512, -32768, 32512]);
  expect(sample!.rate).toBe(8363);
  expect(() => decodeXmSamples(bytes.slice(0, -1))).toThrow('Truncated XM');
});

it('writes a playable mono PCM wave with the decoded sample rate', () => {
  const wave = encodeWav({
    id: 1,
    rate: 22050,
    pcm: new Int16Array([-1000, 0, 1000]),
    loopStart: 0,
    loopEnd: 0,
    pingPong: false,
  });

  const view = new DataView(wave.buffer);

  expect(new TextDecoder().decode(wave.slice(0, 4))).toBe('RIFF');
  expect(view.getUint32(24, true)).toBe(22050);
  expect(view.getUint32(40, true)).toBe(6);
  expect(view.getInt16(44, true)).toBe(-1000);
  expect(view.getInt16(48, true)).toBe(1000);
});
