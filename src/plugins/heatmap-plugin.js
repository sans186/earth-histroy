/**
 * Heatmap plugin – global event density overlay on Cesium globe.
 *
 * Renders all currently loaded events into a canvas heatmap (equirectangular
 * projection), then drapes it onto the globe as a SingleTileImageryLayer.
 * Updates when dataEvents changes (i.e. on year change).
 */

import * as Cesium from 'cesium';
import { parseCoords } from '../utils.js';

const CANVAS_W = 2048;
const CANVAS_H = 1024;
const POINT_RADIUS = 20;
const UPDATE_DEBOUNCE = 150;

// ── Color scale: transparent → blue → cyan → green → yellow → red ──
function densityToColor(t) {
  // t: 0..1  normalized accumulated density
  if (t < 0.005) return [0, 0, 0, 0];

  // 6-stop gradient
  const stops = [
    { pos: 0.00, r: 0,   g: 0,   b: 0,   a: 0 },
    { pos: 0.10, r: 0,   g: 0,   b: 128, a: 160 },
    { pos: 0.25, r: 0,   g: 128, b: 255, a: 200 },
    { pos: 0.45, r: 0,   g: 255, b: 128, a: 220 },
    { pos: 0.70, r: 255, g: 255, b: 0,   a: 240 },
    { pos: 1.00, r: 255, g: 50,  b: 0,   a: 255 },
  ];

  // find bracketing stops
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].pos) { lo = stops[i - 1]; hi = stops[i]; break; }
  }
  const f = (t - lo.pos) / (hi.pos - lo.pos + 1e-9);
  return [
    Math.round(lo.r + f * (hi.r - lo.r)),
    Math.round(lo.g + f * (hi.g - lo.g)),
    Math.round(lo.b + f * (hi.b - lo.b)),
    Math.round(lo.a + f * (hi.a - lo.a)),
  ];
}

// ── Canvas render ──

function renderHeatmapCanvas(events) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  // Pass 1 – density accumulation
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalCompositeOperation = 'lighter';

  for (const evt of events) {
    const coords = parseCoords(evt.coords);
    if (!coords) continue;
    const lat = coords[0], lon = coords[1];
    if (lat == null || lon == null || (lat === 0 && lon === 0)) continue;

    const x = ((lon + 180) / 360) * CANVAS_W;
    const y = ((90 - lat) / 180) * CANVAS_H;
    if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) continue;

    const r = POINT_RADIUS;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pass 2 – colour map
  ctx.globalCompositeOperation = 'source-over';
  const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const d = img.data;

  // Find max density for normalization
  let maxVal = 1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > maxVal) maxVal = d[i];
  }

  for (let i = 0; i < d.length; i += 4) {
    const t = d[i] / maxVal;
    const [r, g, b, a] = densityToColor(t);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
  }
  ctx.putImageData(img, 0, 0);

  return canvas;
}

// ── Plugin ──

export default {
  name: 'heatmap-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const viewer = core.viewer;

    let enabled = false;
    let layer = null;
    let updateTimer = null;

    // ── Toggle button ──
    const btn = document.createElement('button');
    btn.id = 'heatmap-toggle';
    btn.textContent = '🔥 热力图';
    btn.title = '事件密度热力图';
    btn.style.cssText = `
      position: fixed; left: 10px; top: 180px; z-index: 110;
      background: var(--bg-panel); border: 1px solid var(--border-secondary); border-radius: 6px;
      color: var(--btn-text); font-size: 13px; padding: 6px 10px; cursor: pointer;
      transition: left 0.25s ease, background 0.2s, border-color 0.2s, color 0.2s;
      font-family: inherit; line-height: 1;
    `;
    btn.addEventListener('mouseenter', () => {
      if (!enabled) { btn.style.background = 'var(--btn-hover)'; btn.style.color = 'var(--text-white)'; }
    });
    btn.addEventListener('mouseleave', () => {
      if (!enabled) { btn.style.background = 'var(--bg-panel)'; btn.style.color = 'var(--btn-text)'; }
    });

    // ── Sync button position with other left-side toggles ──
    function syncBtnLeft() {
      const warList = document.getElementById('war-list');
      const trajList = document.getElementById('traj-list');
      let offset = 10;
      if (warList?.classList.contains('open')) offset = 300;
      else if (trajList?.classList.contains('open')) offset = 300;
      btn.style.left = offset + 'px';
    }
    // Observe class changes on side panels
    const observer = new MutationObserver(syncBtnLeft);
    const warList = document.getElementById('war-list');
    const trajList = document.getElementById('traj-list');
    if (warList) observer.observe(warList, { attributes: true, attributeFilter: ['class'] });
    if (trajList) observer.observe(trajList, { attributes: true, attributeFilter: ['class'] });

    // ── Add / remove imagery layer ──
    function refreshLayer() {
      // Remove old layer
      if (layer) {
        viewer.imageryLayers.remove(layer, true);
        layer = null;
      }
      if (!enabled) return;

      const events = core.state.get('dataEvents') ?? [];
      if (events.length === 0) return;

      const canvas = renderHeatmapCanvas(events);
      const url = canvas.toDataURL('image/png');

      const provider = new Cesium.SingleTileImageryProvider({
        url,
        rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      });

      layer = viewer.imageryLayers.addImageryProvider(provider, 1);
      // Semi-transparent blend with basemap
      layer.alpha = 0.55;
    }

    function scheduleRefresh() {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(refreshLayer, UPDATE_DEBOUNCE);
    }

    // ── Toggle ──
    btn.addEventListener('click', () => {
      enabled = !enabled;
      if (enabled) {
        btn.style.background = '#c0392b';
        btn.style.borderColor = '#e74c3c';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'var(--bg-panel)';
        btn.style.borderColor = 'var(--border-secondary)';
        btn.style.color = 'var(--btn-text)';
      }
      refreshLayer();
    });

    document.body.appendChild(btn);

    // ── React to data changes ──
    core.state.on('dataEvents', () => {
      if (enabled) scheduleRefresh();
    });

    // ── Re-sync on map mode switch ──
    core.state.on('mapMode', () => {
      // Cesium layer disappears in 2D mode – that's expected;
      // when switching back to 3D, refresh.
      if (enabled) {
        const mode = core.state.get('mapMode') ?? '3d';
        if (mode === '3d') scheduleRefresh();
      }
    });
  },
};