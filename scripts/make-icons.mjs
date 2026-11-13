import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

function crc32(data) {
  let c = ~0;
  for (let i = 0; i < data.length; i += 1) {
    c ^= data[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const outer = size * 0.42;
  const inner = size * 0.3;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.hypot(dx, dy);
      const nx = dx / (size * 0.16);
      const ny = (dy + size * 0.02) / (size * 0.2);
      const stem =
        Math.abs(nx) < 0.18 && ny > -0.9 && ny < 0.95
          ? true
          : Math.abs(nx + 0.72) < 0.16 && ny > -0.55 && ny < 0.95
            ? true
            : Math.abs(nx - 0.72) < 0.16 && ny > -0.55 && ny < 0.95
              ? true
              : Math.abs(ny + 0.15 - Math.abs(nx) * 0.7) < 0.16 && Math.abs(nx) < 0.78;
      let color = [244, 239, 228, 0];
      if (distance <= outer) color = distance >= inner ? [180, 51, 34, 255] : [244, 239, 228, 255];
      if (distance < inner && stem) color = [34, 28, 22, 255];
      const offset = row + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(root, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(root, `${size}.png`), png(size));
}
