import { describe, expect, it } from 'vitest';
import { readBpa, requireAsset } from '../../src/assets/bpa';
import { decodeBpk } from '../../src/assets/bpk';
import { decodeScenery } from '../../src/assets/scenery';

/** Tiny authored archive, not copyrighted game content. */
function archive(name: string, contents: number[]): Uint8Array {
  const bytes = new Uint8Array(4339 + contents.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  [...name].forEach((character, index) => {
    bytes[4 + index] = (character.charCodeAt(0) + 117 - 3 * index) & 255;
  });
  view.setUint32(17, contents.length, true);
  bytes.set(contents, 4339);

  return bytes;
}

function codes(values: number[]): Uint8Array {
  const bits: number[] = [];
  let width = 9;
  let entries = 257;

  for (const value of values) {
    for (let bit = 0; bit < width; bit++) {
      bits.push((value >> bit) & 1);
    }

    if (value === 257) {
      width = 9;
      entries = 257;
    } else if (value !== 256) {
      entries++;

      if (entries >= 1 << width && width < 12) {
        width++;
      }
    }
  }

  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => {
    bytes[index >> 3] = bytes[index >> 3]! | (bit << (index & 7));
  });

  return bytes;
}

describe('original asset formats', () => {
  it('looks up encrypted names without changing file contents', () => {
    const files = readBpa(archive('TEST.BIN', [1, 2, 3]));

    expect([...requireAsset(files, 'test.bin')]).toEqual([1, 2, 3]);
  });

  it('rejects corrupt sizes, invalid paths and incomplete directories', () => {
    expect(() => readBpa(new Uint8Array(10))).toThrow('Truncated');

    const bytes = archive('TEST.BIN', [1]);
    new DataView(bytes.buffer).setUint32(17, 1000, true);

    expect(() => readBpa(bytes)).toThrow('Truncated BPA entry');
    expect(() => readBpa(archive('../TEST', [1]))).toThrow('filename');
  });

  it('rotates decoded literal bytes and resolves a dictionary entry', () => {
    expect([...decodeBpk(codes([257, 8, 16, 258, 256]))]).toEqual([1, 2, 1, 2]);
  });

  it('handles the LZW self-reference case', () => {
    expect([...decodeBpk(codes([257, 8, 258, 256]))]).toEqual([1, 1, 1]);
  });

  it('grows the code width and resets the dictionary within a stream', () => {
    const literals = Array.from({ length: 800 }, (_, index) => index % 256);
    const decoded = decodeBpk(codes([257, ...literals, 257, 8, 256]));

    expect([...decoded]).toEqual([
      ...literals.map((value) => ((value >> 3) | (value << 5)) & 255),
      1,
    ]);
  });

  it('bounds decompression and rejects missing end codes or forward references', () => {
    expect(() => decodeBpk(codes([257, 8, 8, 256]), 1)).toThrow('limit');
    expect(() => decodeBpk(codes([257, 8]))).toThrow('Truncated');
    expect(() => decodeBpk(codes([257, 300, 256]))).toThrow('dictionary');
  });

  it('rejects a truncated scenery object before parsing its vertices', () => {
    expect(() => decodeScenery(new Uint8Array([1, 0]))).toThrow('scenery');
  });
});
