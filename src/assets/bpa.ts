/** Death Rally BPA directory: 255 encrypted 13-byte names + LE uint32 lengths. */
const DIRECTORY_ENTRIES = 255;
const NAME_BYTES = 13;
const ENTRY_BYTES = 17;
const HEADER_BYTES = 4 + DIRECTORY_ENTRIES * ENTRY_BYTES;

export function readBpa(bytes: Uint8Array): ReadonlyMap<string, Uint8Array> {
  if (bytes.length < HEADER_BYTES) {
    throw new Error('Truncated BPA directory');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);

  if (count > DIRECTORY_ENTRIES) {
    throw new Error(`Invalid BPA entry count: ${count}`);
  }

  const files = new Map<string, Uint8Array>();
  let offset = HEADER_BYTES;

  for (let entry = 0; entry < count; entry++) {
    const start = 4 + entry * ENTRY_BYTES;
    let name = '';

    for (let index = 0; index < NAME_BYTES; index++) {
      const value = bytes[start + index]!;

      if (value === 0) {
        break;
      }

      name += String.fromCharCode((value - (117 - 3 * index)) & 255);
    }

    const size = view.getUint32(start + NAME_BYTES, true);

    if (!/^[A-Z0-9_.-]+$/i.test(name) || files.has(name.toUpperCase())) {
      throw new Error(`Invalid or duplicate BPA filename: ${name}`);
    }

    if (offset + size > bytes.length) {
      throw new Error(`Truncated BPA entry: ${name}`);
    }

    files.set(name.toUpperCase(), bytes.slice(offset, offset + size));
    offset += size;
  }

  return files;
}

export function requireAsset(files: ReadonlyMap<string, Uint8Array>, name: string): Uint8Array {
  const bytes = files.get(name.toUpperCase());

  if (!bytes) {
    throw new Error(`Missing original asset: ${name}`);
  }

  return bytes;
}
