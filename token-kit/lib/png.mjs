// @ts-check
// Minimal PNG encoder (RGBA, no dependencies) for the menu bar chart.
import { deflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Simple RGBA canvas that draws rectangles.
 * @param {number} w
 * @param {number} h
 */
export function canvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  return {
    w,
    h,
    /** @param {number} x @param {number} y @param {number} rw @param {number} rh @param {string} hex */
    rect(x, y, rw, rh, hex) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      for (let j = Math.max(0, Math.round(y)); j < Math.min(h, Math.round(y + rh)); j++)
        for (let i = Math.max(0, Math.round(x)); i < Math.min(w, Math.round(x + rw)); i++) px.set([r, g, b, 255], (j * w + i) * 4);
    },
    png() {
      const raw = Buffer.alloc((w * 4 + 1) * h);
      for (let j = 0; j < h; j++) {
        raw[j * (w * 4 + 1)] = 0; // filter type "none"
        Buffer.from(px.buffer, j * w * 4, w * 4).copy(raw, j * (w * 4 + 1) + 1);
      }
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0);
      ihdr.writeUInt32BE(h, 4);
      ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
      return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    },
  };
}
