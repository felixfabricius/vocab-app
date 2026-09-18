// Generates the PWA icons without native dependencies: an SVG plus PNGs
// (solid background with a centred glyph drawn as filled rectangles).
// Run: pnpm icons
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

const BG = [15, 23, 42]; // #0f172a
const FG = [56, 189, 248]; // #38bdf8

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Simple "V" glyph: two diagonal bars, drawn in pixel space. */
function isGlyph(x, y, size) {
  const s = size;
  const t = s * 0.14; // bar thickness
  const top = s * 0.28,
    bottom = s * 0.74;
  if (y < top || y > bottom) return false;
  const p = (y - top) / (bottom - top); // 0..1 down the V
  const left = s * 0.26 + p * (s * 0.5 - s * 0.26);
  const right = s * 0.74 - p * (s * 0.74 - s * 0.5);
  return Math.abs(x - left) < t / 2 || Math.abs(x - right) < t / 2;
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isGlyph(x, y, size) ? FG : BG;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(new URL(name, out), png(size));
}

writeFileSync(
  new URL("icon.svg", out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="20" fill="#0f172a"/>
<path d="M26 28 L50 74 L74 28" stroke="#38bdf8" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`,
);
console.log("icons written to public/icons/");
