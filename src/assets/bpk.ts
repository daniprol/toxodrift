// Adapted from urxp/dRally bpk.c (MIT); see THIRD_PARTY_NOTICES.md.
const END_CODE = 256;
const CLEAR_CODE = 257;
const FIRST_CODE = 258;
const MAX_CODES = 4096;
const DEFAULT_OUTPUT_LIMIT = 8 * 1024 * 1024;

/** LSB-first LZW with swapped clear/end codes and a final byte rotation. */
export function decodeBpk(source: Uint8Array, outputLimit = DEFAULT_OUTPUT_LIMIT): Uint8Array {
  const output = new Uint8Array(outputLimit);
  const prefixes = new Uint16Array(MAX_CODES);
  const suffixes = new Uint8Array(MAX_CODES);
  const stack = new Uint8Array(MAX_CODES);
  let bitOffset = 0;
  let writtenBytes = 0;
  let codeWidth = 9;
  // The reference decoder reserves its first dictionary slot for the initial literal.
  let nextCode = CLEAR_CODE;
  let previousCode = 0;
  let firstByte = 0;

  while (bitOffset + codeWidth <= source.length * 8) {
    let code = 0;

    for (let index = 0; index < codeWidth; index++, bitOffset++) {
      code |= ((source[bitOffset >> 3]! >> (bitOffset & 7)) & 1) << index;
    }

    if (code === END_CODE) {
      return output.slice(0, writtenBytes);
    }

    if (code === CLEAR_CODE) {
      codeWidth = 9;
      nextCode = CLEAR_CODE;
      previousCode = 0;
      firstByte = 0;
      continue;
    }

    if (code > nextCode || (nextCode === CLEAR_CODE && code > 255)) {
      throw new Error('Invalid BPK dictionary reference');
    }

    if (nextCode < MAX_CODES) {
      prefixes[nextCode] = previousCode;
      suffixes[nextCode] = firstByte;
    }

    previousCode = code;

    let depth = 0;

    while (code > 255) {
      if (depth >= MAX_CODES) {
        throw new Error('Cyclic BPK dictionary');
      }

      stack[depth++] = suffixes[code]!;
      code = prefixes[code]!;
    }

    firstByte = code;

    if (nextCode < MAX_CODES) {
      suffixes[nextCode] = firstByte;
    }

    stack[depth++] = firstByte;

    if (writtenBytes + depth > outputLimit) {
      throw new Error('BPK output exceeds limit');
    }

    while (depth > 0) {
      const value = stack[--depth]!;
      output[writtenBytes++] = ((value >> 3) | (value << 5)) & 255;
    }

    nextCode++;

    if (nextCode >= FIRST_CODE && nextCode >= 1 << codeWidth && codeWidth < 12) {
      codeWidth++;
    }
  }

  throw new Error('Truncated BPK stream: missing end code');
}
