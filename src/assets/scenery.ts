const OBJECT_BYTES = 3152;
const TEXTURE_BYTES = 44;
const MAX_OBJECTS = 100;
const MAX_VERTICES = 75;
const MAX_TRIANGLES = 100;
const INT32_BYTES = 4;
const OBJECT_LAYOUT = {
  vertexCount: 0,
  triangleCount: 4,
  vertexX: 8,
  vertexY: 308,
  vertexDepth: 608,
  triangleFirst: 924,
  triangleSecond: 1324,
  triangleThird: 1724,
  triangleColor: 2124,
  worldX: 2524,
  worldY: 2528,
} as const;
const TEXTURE_LAYOUT = {
  width: 0,
  height: 4,
  pixelOffset: 8,
  x: 12,
  y: 16,
  depth: 20,
  object: 36,
  triangle: 40,
} as const;

export interface SceneVertex {
  x: number;
  y: number;
  depth: number;
}

export interface SceneTriangle {
  vertices: [number, number, number];
  color: number;
}

export interface SceneObject {
  x: number;
  y: number;
  vertices: SceneVertex[];
  triangles: SceneTriangle[];
}

export interface SceneTexture {
  width: number;
  height: number;
  x: number;
  y: number;
  depth: number;
  object: number;
  triangle: number;
  pixels: Uint8Array;
}

export interface Scenery {
  objects: SceneObject[];
  textures: SceneTexture[];
}

/** Fixed-size SCE records from race___42824h.c. Coordinates use 8 fractional bits. */
export function decodeScenery(bytes: Uint8Array): Scenery {
  if (bytes.length < 2) {
    throw new Error('Truncated scenery');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const objectCount = bytes[0]!;
  const textureStart = 1 + objectCount * OBJECT_BYTES;

  if (objectCount > MAX_OBJECTS || textureStart >= bytes.length) {
    throw new Error('Invalid scenery objects');
  }

  const textureCount = bytes[textureStart]!;
  const pixelStart = textureStart + 1 + textureCount * TEXTURE_BYTES;

  if (pixelStart > bytes.length) {
    throw new Error('Truncated scenery textures');
  }

  const readInt32 = (offset: number) => view.getInt32(offset, true);
  const objects = Array.from({ length: objectCount }, (_, index): SceneObject => {
    const start = 1 + index * OBJECT_BYTES;
    const vertexCount = readInt32(start + OBJECT_LAYOUT.vertexCount);
    const triangleCount = readInt32(start + OBJECT_LAYOUT.triangleCount);

    if (
      vertexCount < 0 ||
      vertexCount > MAX_VERTICES ||
      triangleCount < 0 ||
      triangleCount > MAX_TRIANGLES
    ) {
      throw new Error('Invalid scenery mesh');
    }

    const vertices = Array.from({ length: vertexCount }, (_, vertex) => ({
      x: readInt32(start + OBJECT_LAYOUT.vertexX + vertex * INT32_BYTES),
      y: readInt32(start + OBJECT_LAYOUT.vertexY + vertex * INT32_BYTES),
      depth: readInt32(start + OBJECT_LAYOUT.vertexDepth + vertex * INT32_BYTES),
    }));

    if (vertices.some((vertex) => vertex.depth <= 0)) {
      throw new Error('Invalid scenery depth');
    }

    const triangles = Array.from({ length: triangleCount }, (_, triangle): SceneTriangle => ({
      vertices: [
        readInt32(start + OBJECT_LAYOUT.triangleFirst + triangle * INT32_BYTES),
        readInt32(start + OBJECT_LAYOUT.triangleSecond + triangle * INT32_BYTES),
        readInt32(start + OBJECT_LAYOUT.triangleThird + triangle * INT32_BYTES),
      ],
      color: readInt32(start + OBJECT_LAYOUT.triangleColor + triangle * INT32_BYTES) & 255,
    }));

    if (
      triangles.some((triangle) =>
        triangle.vertices.some((vertex) => vertex < 0 || vertex >= vertexCount),
      )
    ) {
      throw new Error('Invalid scenery triangle reference');
    }

    return {
      x: readInt32(start + OBJECT_LAYOUT.worldX),
      y: readInt32(start + OBJECT_LAYOUT.worldY),
      vertices,
      triangles,
    };
  });

  const textures = Array.from({ length: textureCount }, (_, index): SceneTexture => {
    const start = textureStart + 1 + index * TEXTURE_BYTES;
    const width = readInt32(start + TEXTURE_LAYOUT.width);
    const height = readInt32(start + TEXTURE_LAYOUT.height);
    const offset = readInt32(start + TEXTURE_LAYOUT.pixelOffset);
    const object = readInt32(start + TEXTURE_LAYOUT.object);
    const triangle = readInt32(start + TEXTURE_LAYOUT.triangle);
    const depth = readInt32(start + TEXTURE_LAYOUT.depth);

    if (
      width < 1 ||
      height < 1 ||
      offset < 0 ||
      pixelStart + offset + width * height > bytes.length ||
      depth <= 0 ||
      !objects[object]?.triangles[triangle]
    ) {
      throw new Error('Invalid scenery texture');
    }

    return {
      width,
      height,
      x: readInt32(start + TEXTURE_LAYOUT.x),
      y: readInt32(start + TEXTURE_LAYOUT.y),
      depth,
      object,
      triangle,
      pixels: bytes.slice(pixelStart + offset, pixelStart + offset + width * height),
    };
  });

  return { objects, textures };
}
