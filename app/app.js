// Vice Cover Studio — a cover-art maker that runs entirely in this page.
// Photos are read from the visitor's own machine, arranged into a multi-panel
// poster, graded, lettered and exported as a PNG. Nothing is uploaded anywhere:
// every file the app loads sits beside this one, and the only thing that ever
// leaves is the PNG the visitor chooses to download.

const $ = (selector) => document.querySelector(selector);

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const clamp01 = (value) => clamp(value, 0, 1);

// ---------------------------------------------------------------------------
// Layouts. Each returns the panel rectangles for a cover of size W x H, as
// fractions worked out against a thin gutter so the panels read as one poster.
// ---------------------------------------------------------------------------

function guttered(rects, w, h) {
  const g = Math.min(w, h) * 0.014;
  return rects.map(([fx, fy, fw, fh]) => ({
    x: fx * w + g / 2,
    y: fy * h + g / 2,
    w: fw * w - g,
    h: fh * h - g,
  }));
}

const LAYOUTS = {
  grid4(w, h) {
    return guttered([
      [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5],
    ], w, h);
  },
  hero3(w, h) {
    return guttered([
      [0, 0, 0.575, 1],
      [0.575, 0, 0.425, 1 / 3], [0.575, 1 / 3, 0.425, 1 / 3], [0.575, 2 / 3, 0.425, 1 / 3],
    ], w, h);
  },
  full(w, h) {
    return guttered([[0, 0, 1, 1]], w, h);
  },
  six(w, h) {
    const cells = [];
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 3; col += 1) cells.push([col / 3, row / 2, 1 / 3, 0.5]);
    }
    return guttered(cells, w, h);
  },
};

// ---------------------------------------------------------------------------
// Grades. A grade turns the arranged panels into one graded cover before the
// lettering goes on, so the whole poster shares a single colour world.
// ---------------------------------------------------------------------------

function rampLut(stops) {
  // stops: [[position 0..1, '#rrggbb'], ...] -> 256-entry [r, g, b] table over luminance.
  const parsed = stops.map(([at, hex]) => [
    at,
    [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)],
  ]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let a = parsed[0];
    let b = parsed[parsed.length - 1];
    for (let s = 0; s < parsed.length - 1; s += 1) {
      if (t >= parsed[s][0] && t <= parsed[s + 1][0]) { a = parsed[s]; b = parsed[s + 1]; break; }
    }
    const span = Math.max(1e-6, b[0] - a[0]);
    const f = clamp01((t - a[0]) / span);
    for (let c = 0; c < 3; c += 1) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f;
  }
  return lut;
}

const GRADES = {
  vice: { kind: 'map', lut: rampLut([[0, '#160a2e'], [0.32, '#5b2160'], [0.58, '#c73e6d'], [0.8, '#ff7e3d'], [1, '#ffe9a8']]) },
  neon: { kind: 'map', lut: rampLut([[0, '#02121e'], [0.38, '#0b5563'], [0.66, '#1fb6c9'], [0.86, '#ff71ce'], [1, '#fff0fa']]) },
  golden: { kind: 'warm' },
  noir: { kind: 'noir' },
};

const contrastLut = (() => {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    lut[i] = clamp(Math.round((t + 0.09 * Math.sin((t - 0.5) * Math.PI) + (t - 0.5) * 0.12) * 255), 0, 255);
  }
  return lut;
})();

function applyGrade(imageData, gradeKey) {
  const data = imageData.data;
  const grade = GRADES[gradeKey];
  if (grade.kind === 'map') {
    const { lut } = grade;
    for (let i = 0; i < data.length; i += 4) {
      const lum = clamp(Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]), 0, 255);
      const at = lum * 3;
      data[i] = lut[at];
      data[i + 1] = lut[at + 1];
      data[i + 2] = lut[at + 2];
    }
  } else if (grade.kind === 'warm') {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = contrastLut[clamp(Math.round(data[i] * 1.07 + 6), 0, 255)];
      data[i + 1] = contrastLut[clamp(Math.round(data[i + 1] * 1.01 + 2), 0, 255)];
      data[i + 2] = contrastLut[clamp(Math.round(data[i + 2] * 0.82), 0, 255)];
    }
  } else if (grade.kind === 'noir') {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = clamp(Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b), 0, 255);
      const v = contrastLut[lum];
      // The pop: a strong warm colour survives the monochrome.
      const warm = r - b;
      const strong = Math.max(r, g, b) - Math.min(r, g, b);
      if (warm > 42 && strong > 60) {
        const keep = 0.62;
        data[i] = v + (r - v) * keep;
        data[i + 1] = v + (g - v) * keep;
        data[i + 2] = v + (b - v) * keep;
      } else {
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------

const SAMPLES = [
  { src: 'samples/boulevard.jpg', name: 'Boulevard' },
  { src: 'samples/pier.jpg', name: 'Pier' },
  { src: 'samples/marquee.jpg', name: 'Marquee' },
];

const state = {
  photos: [], // { img, name }
  layout: 'grid4',
  grade: 'vice',
  panels: [], // { photo, panX, panY, zoom }
  selected: 0,
  grain: 0.35,
  vignette: 0.45,
  title: 'VICE COVER',
  subtitle: 'one night in the neon city',
  badge: 'LAUNCH WEEK',
  titleGradient: true,
  aspect: { w: 1080, h: 1080 },
};

function freshPanel(photo) {
  return { photo, panX: 0.5, panY: 0.5, zoom: 1 };
}

function rebuildPanels(count) {
  const next = [];
  for (let i = 0; i < count; i += 1) {
    const kept = state.panels[i];
    next.push(kept ? { ...kept } : freshPanel(state.photos.length ? i % state.photos.length : -1));
  }
  state.panels = next;
  state.selected = clamp(state.selected, 0, Math.max(0, count - 1));
}

function panelCount() {
  return LAYOUTS[state.layout](state.aspect.w, state.aspect.h).length;
}

// ---------------------------------------------------------------------------
// Cover rendering. The art is always composed on an offscreen canvas at the
// cover's true size; the editor then scales that picture down for preview,
// and export hands the full-size picture over untouched.
// ---------------------------------------------------------------------------

const noiseCanvas = (() => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const image = ctx.createImageData(256, 256);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 96);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return c;
})();

// Cover-fit geometry for one photo inside one panel: the drawn size and the
// travel available to panning, shared by the renderer and the drag handler.
function coverFit(img, rect, zoom) {
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  return { dw, dh, ox: Math.max(0, dw - rect.w), oy: Math.max(0, dh - rect.h) };
}

function drawPanel(ctx, rect, panel, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  const photo = state.photos[panel.photo];
  if (photo) {
    const fit = coverFit(photo.img, rect, panel.zoom);
    ctx.drawImage(
      photo.img,
      rect.x - panel.panX * fit.ox,
      rect.y - panel.panY * fit.oy,
      fit.dw,
      fit.dh,
    );
  } else {
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    grad.addColorStop(0, '#2a2140');
    grad.addColorStop(1, '#171126');
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = 'rgba(243, 237, 226, 0.5)';
    ctx.font = `${Math.round(Math.min(w, h) * 0.028)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('add a photo', rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
  ctx.restore();
}

function drawLettering(ctx, w, h) {
  const unit = Math.min(w, h);

  if (state.badge.trim()) {
    ctx.save();
    ctx.translate(w * 0.062, h * 0.06);
    ctx.rotate(-0.055);
    ctx.font = `bold ${Math.round(unit * 0.034)}px ViceDisplay, sans-serif`;
    const text = state.badge.trim().toUpperCase();
    const tw = ctx.measureText(text).width;
    const padX = unit * 0.022;
    const bh = unit * 0.058;
    const ribbon = ctx.createLinearGradient(0, 0, tw + padX * 2, 0);
    ribbon.addColorStop(0, '#ff7e3d');
    ribbon.addColorStop(1, '#ff4d8d');
    ctx.fillStyle = ribbon;
    ctx.fillRect(0, -bh / 2, tw + padX * 2, bh);
    ctx.fillStyle = '#1c0b12';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, padX, bh * 0.03);
    ctx.restore();
  }

  const title = (state.title.trim() || 'VICE COVER').toUpperCase();
  let size = unit * 0.128;
  ctx.save();
  ctx.textAlign = 'center';
  const setTitleFont = () => { ctx.font = `bold ${Math.round(size)}px ViceDisplay, sans-serif`; };
  setTitleFont();
  while (ctx.measureText(title).width * 0.84 > w * 0.94 && size > unit * 0.04) {
    size *= 0.94;
    setTitleFont();
  }
  const titleY = h * 0.175;
  ctx.translate(w / 2, titleY);
  ctx.scale(0.84, 1); // condense the bold face into a poster cut
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#150510';
  ctx.lineWidth = size * 0.17;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = size * 0.07;
  ctx.shadowOffsetY = size * 0.045;
  ctx.strokeText(title, 0, 0);
  if (state.titleGradient) {
    const fill = ctx.createLinearGradient(0, -size, 0, size * 0.25);
    fill.addColorStop(0, '#ffe9a8');
    fill.addColorStop(0.52, '#ff7e3d');
    fill.addColorStop(1, '#ff4d8d');
    ctx.fillStyle = fill;
  } else {
    ctx.fillStyle = '#fff6e8';
  }
  ctx.fillText(title, 0, 0);
  ctx.restore();

  if (state.subtitle.trim()) {
    ctx.save();
    ctx.font = `italic ${Math.round(unit * 0.036)}px ViceScript, serif`;
    ctx.textAlign = 'center';
    try { ctx.letterSpacing = `${Math.round(unit * 0.006)}px`; } catch { /* older engines */ }
    ctx.fillStyle = '#ffe9d2';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = unit * 0.012;
    ctx.fillText(state.subtitle.trim(), w / 2, titleY + unit * 0.062);
    ctx.restore();
  }
}

const artCanvas = document.createElement('canvas');

function renderArt(w, h) {
  artCanvas.width = w;
  artCanvas.height = h;
  const ctx = artCanvas.getContext('2d');
  const rects = LAYOUTS[state.layout](w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  rects.forEach((rect, i) => drawPanel(ctx, rect, state.panels[i] ?? freshPanel(-1), w, h));

  const image = ctx.getImageData(0, 0, w, h);
  applyGrade(image, state.grade);
  ctx.putImageData(image, 0, 0);

  // Panel seams, drawn after grading so they stay crisp and dark.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.007);
  rects.forEach((rect) => ctx.strokeRect(rect.x, rect.y, rect.w, rect.h));

  if (state.grain > 0) {
    ctx.save();
    ctx.globalAlpha = state.grain * 0.32;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(noiseCanvas, 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (state.vignette > 0) {
    const radius = Math.hypot(w, h) / 2;
    const shade = ctx.createRadialGradient(w / 2, h / 2, radius * 0.42, w / 2, h / 2, radius);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, `rgba(5,0,12,${(state.vignette * 0.82).toFixed(3)})`);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  }

  drawLettering(ctx, w, h);
  return artCanvas;
}

// ---------------------------------------------------------------------------
// Editor wiring.
// ---------------------------------------------------------------------------

const canvas = $('#cover');
const previewCtx = canvas.getContext('2d');
let lastRects = [];

function renderPreview() {
  const { w, h } = state.aspect;
  const art = renderArt(w, h);
  const scale = w > 1200 ? 0.6 : 1; // the on-screen copy is lighter; the art is not
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  previewCtx.drawImage(art, 0, 0, canvas.width, canvas.height);
  lastRects = LAYOUTS[state.layout](w, h);
  const selected = lastRects[state.selected];
  if (selected) {
    previewCtx.save();
    previewCtx.strokeStyle = '#22d3ee';
    previewCtx.lineWidth = Math.max(2, Math.min(canvas.width, canvas.height) * 0.005);
    previewCtx.setLineDash([Math.min(canvas.width, canvas.height) * 0.02, Math.min(canvas.width, canvas.height) * 0.012]);
    previewCtx.strokeRect(selected.x * scale, selected.y * scale, selected.w * scale, selected.h * scale);
    previewCtx.restore();
  }
  buildPanelStrip();
}

function setStatus(message, done = false) {
  const el = $('#status');
  el.textContent = message;
  el.classList.toggle('done', done);
}

function buildPanelStrip() {
  const strip = $('#panel-strip');
  strip.innerHTML = '';
  state.panels.forEach((panel, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Panel ${i + 1}`;
    button.classList.toggle('active', i === state.selected);
    button.addEventListener('click', () => {
      state.selected = i;
      syncZoomSlider();
      renderPreview();
    });
    strip.appendChild(button);
  });
}

function buildPhotoStrip() {
  const strip = $('#photo-strip');
  strip.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    img.title = photo.name;
    img.addEventListener('click', () => {
      if (!state.panels.length) rebuildPanels(panelCount());
      state.panels[state.selected].photo = i;
      renderPreview();
    });
    strip.appendChild(img);
  });
}

function addPhoto(img, name) {
  state.photos.push({ img, name });
  if (!state.panels.length) rebuildPanels(panelCount());
  state.panels.forEach((panel, i) => {
    if (panel.photo < 0 || i === state.selected) panel.photo = state.photos.length - 1;
  });
  buildPhotoStrip();
  renderPreview();
}

function loadPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => addPhoto(img, file.name);
  img.src = url;
}

function wireControls() {
  const input = $('#file-input');
  input.addEventListener('change', () => {
    [...input.files].forEach(loadPhotoFile);
    input.value = '';
  });

  const drop = $('#drop-zone');
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => { stop(event); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => { stop(event); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (event) => {
    [...event.dataTransfer.files].filter((f) => f.type.startsWith('image/')).forEach(loadPhotoFile);
  });
  window.addEventListener('dragover', stop);
  window.addEventListener('drop', stop);

  $('#layout-buttons').addEventListener('click', (event) => {
    const button = event.target.closest('[data-layout]');
    if (!button) return;
    state.layout = button.dataset.layout;
    document.querySelectorAll('#layout-buttons button').forEach((b) => b.classList.toggle('active', b === button));
    rebuildPanels(panelCount());
    syncZoomSlider();
    renderPreview();
  });

  $('#grade-buttons').addEventListener('click', (event) => {
    const button = event.target.closest('[data-grade]');
    if (!button) return;
    state.grade = button.dataset.grade;
    document.querySelectorAll('#grade-buttons button').forEach((b) => b.classList.toggle('active', b === button));
    renderPreview();
  });

  $('#grain').addEventListener('input', (event) => { state.grain = event.target.value / 100; renderPreview(); });
  $('#vignette').addEventListener('input', (event) => { state.vignette = event.target.value / 100; renderPreview(); });
  $('#title').addEventListener('input', (event) => { state.title = event.target.value; renderPreview(); });
  $('#subtitle').addEventListener('input', (event) => { state.subtitle = event.target.value; renderPreview(); });
  $('#badge').addEventListener('input', (event) => { state.badge = event.target.value; renderPreview(); });
  $('#title-gradient').addEventListener('change', (event) => { state.titleGradient = event.target.checked; renderPreview(); });
  $('#zoom').addEventListener('input', (event) => {
    const panel = state.panels[state.selected];
    if (panel) panel.zoom = event.target.value / 100;
    renderPreview();
  });

  document.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => exportPng(button.dataset.export));
  });

  // Click a panel to select it; drag to pan its photo inside the frame.
  // Pointer positions are converted into cover coordinates once, here.
  const toCover = (event) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (state.aspect.w / box.width),
      y: (event.clientY - box.top) * (state.aspect.h / box.height),
    };
  };
  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    const point = toCover(event);
    const at = lastRects.findIndex((r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
    if (at >= 0) {
      state.selected = at;
      syncZoomSlider();
    }
    const panel = state.panels[state.selected];
    const rect = lastRects[state.selected];
    const photo = panel && state.photos[panel.photo];
    drag = {
      x: point.x, y: point.y,
      panX: panel ? panel.panX : 0.5, panY: panel ? panel.panY : 0.5,
      fit: photo && rect ? coverFit(photo.img, rect, panel.zoom) : null,
    };
    canvas.setPointerCapture(event.pointerId);
    renderPreview();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const point = toCover(event);
    const panel = state.panels[state.selected];
    if (!panel || !drag.fit) return;
    if (drag.fit.ox > 0) panel.panX = clamp01(drag.panX - (point.x - drag.x) / drag.fit.ox);
    if (drag.fit.oy > 0) panel.panY = clamp01(drag.panY - (point.y - drag.y) / drag.fit.oy);
    renderPreview();
  });
  ['pointerup', 'pointercancel'].forEach((name) => canvas.addEventListener(name, () => { drag = null; }));

  // Fine control: the wheel zooms the selected panel's photo, a double-click
  // deals the panel the next loaded photo, and the arrow keys nudge its crop.
  canvas.addEventListener('wheel', (event) => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    event.preventDefault();
    panel.zoom = clamp(panel.zoom * (event.deltaY < 0 ? 1.07 : 0.93), 1, 3);
    syncZoomSlider();
    renderPreview();
  }, { passive: false });
  canvas.addEventListener('dblclick', () => {
    const panel = state.panels[state.selected];
    if (!panel || state.photos.length < 2) return;
    panel.photo = (panel.photo + 1) % state.photos.length;
    renderPreview();
  });
  window.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea')) return;
    const panel = state.panels[state.selected];
    if (!panel) return;
    const step = event.shiftKey ? 0.08 : 0.02;
    if (event.key === 'ArrowLeft') panel.panX = clamp01(panel.panX - step);
    else if (event.key === 'ArrowRight') panel.panX = clamp01(panel.panX + step);
    else if (event.key === 'ArrowUp') panel.panY = clamp01(panel.panY - step);
    else if (event.key === 'ArrowDown') panel.panY = clamp01(panel.panY + step);
    else return;
    event.preventDefault();
    renderPreview();
  });
}

function syncZoomSlider() {
  const panel = state.panels[state.selected];
  if (panel) $('#zoom').value = Math.round(panel.zoom * 100);
}

function exportPng(spec) {
  const [w, h] = spec.split('x').map(Number);
  state.aspect = { w, h };
  renderArt(w, h).toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vice-cover-${w}x${h}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    setStatus(`Exported a ${w} × ${h} PNG — check your downloads.`, true);
  }, 'image/png');
  renderPreview();
}

// ---------------------------------------------------------------------------
// Shot scenes and startup. A ?shot= page renders one deterministic scene with
// the bundled samples, so screenshots need no clicking around first.
// ---------------------------------------------------------------------------

const SHOT_PRESETS = {
  studio: {
    layout: 'grid4', grade: 'vice', aspect: { w: 1080, h: 1080 },
    title: 'VICE COVER', subtitle: 'one night in the neon city', badge: 'LAUNCH WEEK',
    assign: [0, 1, 2, 1], zooms: [1.12, 1.05, 1.2, 1.08], selected: 1,
  },
  'cover-grid': {
    layout: 'grid4', grade: 'vice', aspect: { w: 1080, h: 1080 },
    title: 'VICE COVER', subtitle: 'one night in the neon city', badge: 'LAUNCH WEEK',
    assign: [0, 1, 2, 0], zooms: [1.15, 1.05, 1.22, 1.1], selected: 0,
  },
  'cover-hero': {
    layout: 'hero3', grade: 'neon', aspect: { w: 1080, h: 1350 },
    title: 'NEON HEAT', subtitle: 'midnight run on the boulevard', badge: 'LAUNCH WEEK',
    assign: [1, 0, 2, 0], zooms: [1.1, 1.18, 1.06, 1.55],
    // The fourth panel reuses the boulevard sample at a tight off-centre crop,
    // so it reads as a different shot from the same photo in the top-right panel.
    pans: [[0.5, 0.42], [0.5, 0.42], [0.5, 0.42], [0.12, 0.72]],
    selected: 0,
  },
  'cover-wide': {
    layout: 'full', grade: 'vice', aspect: { w: 1920, h: 1080 },
    title: 'VICE COVER', subtitle: 'one night in the neon city', badge: 'LAUNCH WEEK',
    assign: [0], zooms: [1.12], selected: 0,
  },
};

function applyPreset(preset) {
  state.layout = preset.layout;
  state.grade = preset.grade;
  state.aspect = { ...preset.aspect };
  state.title = preset.title;
  state.subtitle = preset.subtitle;
  state.badge = preset.badge;
  state.panels = preset.assign.map((photo, i) => ({
    ...freshPanel(photo),
    zoom: preset.zooms[i] ?? 1,
    panX: preset.pans?.[i]?.[0] ?? 0.5,
    panY: preset.pans?.[i]?.[1] ?? 0.42,
  }));
  state.selected = preset.selected ?? 0;
  // Reflect the preset in the controls so the studio shot shows a lived-in editor.
  $('#title').value = state.title;
  $('#subtitle').value = state.subtitle;
  $('#badge').value = state.badge;
  document.querySelectorAll('#layout-buttons button').forEach((b) => b.classList.toggle('active', b.dataset.layout === state.layout));
  document.querySelectorAll('#grade-buttons button').forEach((b) => b.classList.toggle('active', b.dataset.grade === state.grade));
  syncZoomSlider();
}

async function loadFonts() {
  const display = new FontFace('ViceDisplay', "url('fonts/display-bold.ttf')");
  const script = new FontFace('ViceScript', "url('fonts/subtitle-italic.ttf')");
  document.fonts.add(display);
  document.fonts.add(script);
  await Promise.all([display.load(), script.load()]);
}

function loadSamples() {
  return Promise.all(SAMPLES.map(({ src, name }) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { state.photos.push({ img, name }); resolve(); };
    img.onerror = () => resolve();
    img.src = src;
  })));
}

async function init() {
  wireControls();
  const shot = new URLSearchParams(location.search).get('shot');
  await loadFonts();
  await loadSamples();
  buildPhotoStrip();
  if (shot && SHOT_PRESETS[shot]) {
    applyPreset(SHOT_PRESETS[shot]);
    if (shot !== 'studio') {
      document.body.classList.add('shot-cover');
      canvas.width = state.aspect.w;
      canvas.height = state.aspect.h;
      previewCtx.drawImage(renderArt(state.aspect.w, state.aspect.h), 0, 0);
      return;
    }
    document.body.classList.add('shot-studio');
  } else {
    applyPreset(SHOT_PRESETS.studio);
  }
  setStatus(`Ready — ${state.photos.length} sample photos loaded. Add your own any time.`);
  renderPreview();
}

init();
