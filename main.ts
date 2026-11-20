// Vice Cover Studio — hand-in program for gta6-cover-art-01 (Node 22, standard library only).
//
// The entry itself is the static web app in app/: plain files a desktop browser opens offline,
// no build step and no network request. This program is only the courier. It first pre-flights
// screenshots/ against the scorer's caps, then copies app/ and screenshots/ into the output
// directory and writes dossier.json there with the vendored make.fun library.
//
// Run it the way the grader does, or locally with an output override:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's screenshot caps (reference/gate.json): 3 or 4 images, each at most 256 KiB,
// long side at most 1280 px and short side at least 480 px. Refuse early, with a readable
// reason, rather than hand in an entry the scorer would refuse anyway.
const SHOT_MAX_BYTES = 262144;
const SHOT_LONG_MAX = 1280;
const SHOT_SHORT_MIN = 480;

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

// Width and height out of a PNG header: the IHDR chunk always starts at byte 8, and its
// first two fields are the big-endian width and height.
function pngSize(buf: Buffer): { w: number; h: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || signature.some((byte, i) => buf[i] !== byte)) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Width and height out of a JPEG stream: walk the marker segments after the SOI until a
// start-of-frame marker (SOF0/1/2 and their kin) turns up; its payload opens with the
// precision byte, then big-endian height and width.
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (sofMarkers.has(marker)) {
      if (offset + 9 > buf.length) return null;
      return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function imageSize(path: string): { w: number; h: number } | null {
  const buf = readFileSync(path);
  return pngSize(buf) ?? jpegSize(buf);
}

function preflightScreenshots(): void {
  const dir = join(here, 'screenshots');
  if (!existsSync(dir)) fail('screenshots/ is missing: the entry needs 3 or 4 screenshots.');
  const shots = readdirSync(dir)
    .filter((name) => ['.png', '.jpg', '.jpeg'].includes(extname(name).toLowerCase()))
    .sort();
  if (shots.length < 3 || shots.length > 4) {
    fail(`screenshots/ holds ${shots.length} image(s); the scorer takes 3 or 4.`);
  }
  for (const name of shots) {
    const path = join(dir, name);
    const { size } = statSync(path);
    if (size > SHOT_MAX_BYTES) fail(`${name} is ${size} bytes; the cap is ${SHOT_MAX_BYTES}.`);
    const dims = imageSize(path);
    if (!dims) fail(`${name}: could not read image dimensions.`);
    const long = Math.max(dims.w, dims.h);
    const short = Math.min(dims.w, dims.h);
    if (long > SHOT_LONG_MAX) fail(`${name} is ${dims.w}x${dims.h}; long side over ${SHOT_LONG_MAX}.`);
    if (short < SHOT_SHORT_MIN) fail(`${name} is ${dims.w}x${dims.h}; short side under ${SHOT_SHORT_MIN}.`);
  }
}

preflightScreenshots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Same caps the starter hands buildDossier: they make this program refuse anything the
// scorer's gate would refuse (app file count and bytes, path length, screenshot limits).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: SHOT_MAX_BYTES },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

console.log('Vice Cover Studio handed in: app/, screenshots/ and dossier.json in', out);
