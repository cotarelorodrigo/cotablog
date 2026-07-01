// Generates public/photo.jpg — actually a PNG written to that path (browsers sniff by
// content, and Vite serves it fine). Pure Node, zero dependencies: we hand-encode a PNG
// using zlib. The placeholder is a stylized portrait-ish silhouette on a gradient so the
// cube effect looks like "a photo" until the user drops in their real one.
//
// Run: npm run placeholder

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from './crc32.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/photo.jpg');
const W = 900;
const H = 1200;

// Build RGBA pixel buffer.
const rgba = Buffer.alloc(W * H * 4);

function set(x, y, r, g, b) {
  const i = (y * W + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = 255;
}

// Background: warm-to-cool vertical gradient.
for (let y = 0; y < H; y++) {
  const t = y / H;
  const bgR = Math.round(30 + 40 * (1 - t));
  const bgG = Math.round(34 + 30 * (1 - t));
  const bgB = Math.round(48 + 60 * t);
  for (let x = 0; x < W; x++) {
    set(x, y, bgR, bgG, bgB);
  }
}

// Simple centered "portrait": head (circle) + shoulders (rounded trapezoid), lit from left.
const cx = W / 2;
const headCy = H * 0.38;
const headR = W * 0.22;
const skin = [219, 178, 148];

function shade(base, nx) {
  // nx in [-1,1] left→right; fake key light from upper-left.
  const l = 0.75 + 0.45 * (-nx * 0.5 + 0.5);
  return base.map((c) => Math.max(0, Math.min(255, Math.round(c * l))));
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // Head
    const dx = x - cx;
    const dy = y - headCy;
    const rr = Math.hypot(dx / headR, dy / (headR * 1.18));
    if (rr <= 1) {
      const nx = dx / headR;
      const [r, g, b] = shade(skin, nx);
      set(x, y, r, g, b);
      continue;
    }
    // Shoulders/torso
    const shoulderTop = H * 0.62;
    if (y >= shoulderTop) {
      const halfW = W * 0.16 + (y - shoulderTop) * 0.55;
      if (Math.abs(dx) <= halfW) {
        const nx = dx / halfW;
        const [r, g, b] = shade([44, 52, 78], nx);
        set(x, y, r, g, b);
      }
    }
  }
}

// Encode PNG (single IDAT, filter type 0 per scanline).
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter: none
  rgba.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`Wrote placeholder ${W}x${H} -> ${OUT} (${(png.length / 1024).toFixed(1)} KB)`);
