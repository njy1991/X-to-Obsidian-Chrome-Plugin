// Generates simple placeholder PNG icons for the extension.
// A solid rounded-rect with a stylised "O" glyph for Obsidian.
// Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SIZES = [16, 32, 128];
const OUT_DIR = resolve("src/icons");

// Colors
const BG = [124, 58, 237]; // purple
const FG = [255, 255, 255];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  // Render a stylised glyph onto a size×size RGBA buffer.
  const w = size, h = size;
  const pixels = Buffer.alloc(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  const outerR = w * 0.42;
  const innerR = w * 0.22;
  const corner = w * 0.18;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Rounded square mask
      const dx = Math.max(0, Math.abs(x + 0.5 - cx) - (w / 2 - corner));
      const dy = Math.max(0, Math.abs(y + 0.5 - cy) - (h / 2 - corner));
      const inside = Math.hypot(dx, dy) <= corner;
      if (!inside) {
        pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0;
        continue;
      }
      // Glyph: ring (annulus)
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const inRing = r >= innerR && r <= outerR;
      const c = inRing ? FG : BG;
      pixels[i] = c[0]; pixels[i + 1] = c[1]; pixels[i + 2] = c[2]; pixels[i + 3] = 255;
    }
  }

  // PNG: signature + IHDR + IDAT + IEND
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Filter byte per scanline (0 = None), then RGBA bytes.
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    pixels.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const s of SIZES) {
  const out = resolve(OUT_DIR, `icon${s}.png`);
  writeFileSync(out, makePng(s));
  console.log(`wrote ${out}`);
}
