# Vice Cover Studio

[![gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/ngadukun/vice-cover-studio-2/rank.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/ngadukun/vice-cover-studio-2/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Turn your own photos into GTA-style multi-panel cover art — a bold poster with
sunset or neon colour grading, poster lettering and a badge ribbon — and export
it as a PNG ready to share. Vice Cover Studio is a single web page that runs
**entirely offline in your browser**: no uploads, no accounts, no network
requests. Your photos never leave your machine.

## A quick tour

1. **Photos** — Drop photos onto the page or pick them with the file button.
   Three bundled samples are loaded at startup so the studio works immediately.
2. **Layout** — Four panel structures in the cover tradition: *Grid Four* (2×2),
   *Hero + Three* (a tall hero panel beside three stacked ones), *Full Bleed*
   (one dramatic panel) and *Six Pack* (3×2).
3. **Arrange** — Click a panel on the cover to select it, click a photo to put
   it in. Drag on the cover to pan the photo inside its panel; use the zoom
   slider (or the mouse wheel) to crop tighter. Double-click a panel to deal
   it the next photo; arrow keys nudge the crop.
4. **Grade** — One colour world for the whole poster: *Vice Sunset* (purple →
   pink → orange gradient map), *Neon Night* (teal-to-pink duotone),
   *Golden Hour* (warm film lift) or *Noir Pop* (high-contrast monochrome that
   lets strong warm colours survive). Film grain and vignette sliders finish it.
5. **Lettering** — An editable title in a bold condensed poster cut with an
   optional sunset-gradient fill, an italic subtitle, and a tilted badge
   ribbon with your own text.
6. **Export** — One click renders the cover as a PNG at **1080 × 1080**,
   **1080 × 1350** or **1920 × 1080** — the sizes feeds and stories expect.

## How the cover is made

The composition pipeline is one function used for both the live preview and
the export, so what you see is exactly what you share:

1. Each panel cover-fits its photo (fill the frame, keep the aspect) at the
   panel's zoom, offset by the panel's pan.
2. The arranged panels are graded as a single picture — gradient-map or
   duotone ramps over luminance for Vice Sunset and Neon Night, a warm
   channel lift for Golden Hour, a contrast monochrome with a warm-colour
   pop for Noir — then the panel seams, film grain and vignette go on.
3. The lettering is drawn last, ungraded, the way a poster's title sits on
   top of its art.

## Run it

The app is plain static files under `app/` — serve that folder with anything:

```sh
cd app && python3 -m http.server 8080
# then open http://localhost:8080
```

No build step, no dependencies, no network needed after the page is served
locally. (Opening `app/index.html` straight from disk also works in most
browsers.)

## Handing it in (make.fun)

`main.ts` (Node 22, standard library only) is the entry's courier: it
pre-flights `screenshots/` against the scorer's caps (3–4 images, ≤ 256 KiB
each, long side ≤ 1280 px, short side ≥ 480 px), copies `app/` and
`screenshots/` into the output directory and writes `dossier.json` there with
the vendored library in `vendor/makefun-app.ts`.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`shots.json` lists the deterministic screenshot scenes the app renders on
load — `?shot=studio`, `?shot=cover-grid`, `?shot=cover-hero` and
`?shot=cover-wide` — each composed from the bundled samples with no
interaction needed.

## Credits and licenses

- Code: MIT (see `LICENSE`).
- Display and subtitle type: Liberation Sans Bold / Italic, vendored under
  `app/fonts/` and licensed under the SIL Open Font License 1.1 (see
  `app/fonts/FONT-LICENSE.txt`). The title is drawn with a horizontal
  condense for the poster cut.
- Sample photos under `app/samples/` ship with the make.fun starter kit and
  are free to use.
- Everything here is original work: no Rockstar Games logos, artwork or
  fonts are used anywhere.
