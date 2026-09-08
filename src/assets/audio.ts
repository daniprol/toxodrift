const XM_SIGNATURE = 'Extended Module: ';
const XM_BASE_RATE = 8363;
const WAV_HEADER_BYTES = 44;
const XM_MODULE_HEADER = { size: 60, patterns: 70, instruments: 72 } as const;
const XM_INSTRUMENT_HEADER = { minimumBytes: 29, sampleCount: 27, sampleHeaderBytes: 29 } as const;
const XM_SAMPLE_HEADER = {
  minimumBytes: 40,
  loopStart: 4,
  loopLength: 8,
  fineTune: 13,
  flags: 14,
  relativeNote: 16,
} as const;

/** CMF wraps tracker modules with a position-dependent byte cipher. */
export function decodeCmf(bytes: Uint8Array): Uint8Array {
  return bytes.map((value, index) => {
    const rotation = index % 7;

    return (((value << rotation) | (value >> (8 - rotation))) - 109 - 17 * index) & 255;
  });
}

export interface AudioSample {
  id: number;
  rate: number;
  pcm: Int16Array;
  loopStart: number;
  loopEnd: number;
  pingPong: boolean;
}

/** Extract delta-coded PCM from the original XM effect bank. */
export function decodeXmSamples(bytes: Uint8Array): AudioSample[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const requireBytes = (offset: number, size: number) => {
    if (offset < 0 || offset + size > bytes.length) {
      throw new Error('Truncated XM audio');
    }
  };

  requireBytes(0, 80);

  if (new TextDecoder().decode(bytes.slice(0, 17)) !== XM_SIGNATURE) {
    throw new Error('Invalid XM signature');
  }

  let cursor = XM_MODULE_HEADER.size + view.getUint32(XM_MODULE_HEADER.size, true);

  for (let index = 0; index < view.getUint16(XM_MODULE_HEADER.patterns, true); index++) {
    requireBytes(cursor, 9);
    cursor += view.getUint32(cursor, true) + view.getUint16(cursor + 7, true);
  }

  const result: AudioSample[] = [];

  for (
    let instrument = 0;
    instrument < view.getUint16(XM_MODULE_HEADER.instruments, true);
    instrument++
  ) {
    requireBytes(cursor, XM_INSTRUMENT_HEADER.minimumBytes);

    const headerSize = view.getUint32(cursor, true);
    const sampleCount = view.getUint16(cursor + XM_INSTRUMENT_HEADER.sampleCount, true);

    if (headerSize < XM_INSTRUMENT_HEADER.minimumBytes) {
      throw new Error('Invalid XM instrument header');
    }

    if (!sampleCount) {
      cursor += headerSize;
      continue;
    }

    requireBytes(cursor, 33);

    const sampleHeaderSize = view.getUint32(cursor + XM_INSTRUMENT_HEADER.sampleHeaderBytes, true);

    if (sampleHeaderSize < XM_SAMPLE_HEADER.minimumBytes) {
      throw new Error('Invalid XM sample header');
    }

    let dataOffset = cursor + headerSize + sampleCount * sampleHeaderSize;

    for (let sample = 0; sample < sampleCount; sample++) {
      const header = cursor + headerSize + sample * sampleHeaderSize;
      requireBytes(header, XM_SAMPLE_HEADER.minimumBytes);

      const length = view.getUint32(header, true);
      const flags = bytes[header + XM_SAMPLE_HEADER.flags]!;
      const bytesPerSample = flags & 16 ? 2 : 1;
      requireBytes(dataOffset, length);

      if (length % bytesPerSample) {
        throw new Error('Invalid XM PCM length');
      }

      const pcm = new Int16Array(length / bytesPerSample);
      let accumulator = 0;

      for (let index = 0; index < pcm.length; index++) {
        accumulator +=
          bytesPerSample === 2
            ? view.getInt16(dataOffset + index * 2, true)
            : view.getInt8(dataOffset + index);
        pcm[index] = bytesPerSample === 2 ? accumulator : ((accumulator << 24) >> 24) * 256;
      }

      const rate = Math.round(
        XM_BASE_RATE *
          2 **
            ((view.getInt8(header + XM_SAMPLE_HEADER.relativeNote) +
              view.getInt8(header + XM_SAMPLE_HEADER.fineTune) / 128) /
              12),
      );

      if (length > 0) {
        result.push({
          id: instrument + 1,
          rate,
          pcm,
          loopStart: view.getUint32(header + XM_SAMPLE_HEADER.loopStart, true) / bytesPerSample,
          loopEnd:
            (view.getUint32(header + XM_SAMPLE_HEADER.loopStart, true) +
              view.getUint32(header + XM_SAMPLE_HEADER.loopLength, true)) /
            bytesPerSample,
          pingPong: (flags & 3) === 2,
        });
      }

      dataOffset += length;
    }

    cursor = dataOffset;
  }

  return result;
}

export function encodeWav(sample: AudioSample): Uint8Array {
  const output = new Uint8Array(WAV_HEADER_BYTES + sample.pcm.length * 2);
  const view = new DataView(output.buffer);
  const tag = (offset: number, value: string) =>
    output.set(new TextEncoder().encode(value), offset);
  tag(0, 'RIFF');
  view.setUint32(4, output.length - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sample.rate, true);
  view.setUint32(28, sample.rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, sample.pcm.length * 2, true);
  sample.pcm.forEach((value, index) => view.setInt16(WAV_HEADER_BYTES + index * 2, value, true));

  return output;
}
