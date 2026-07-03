/**
 * Trajectory plugin – historical figure life-path visualisation.
 *
 * Data source: AI-generated person profiles in /public/people/profiles/
 *
 * Features:
 *  - Toggle button to open/close left person list panel
 *  - Person list (left side, styled like event panel)
 *  - Trajectory path rendered on Cesium (polyline + markers)
 *  - Step-by-step navigation (prev/next) with camera fly-to
 *  - Auto-play mode that walks through the full trajectory
 *  - Detail card with location description, evaluation & quotes
 *  - Timeline year sync
 */

import * as Cesium from 'cesium';
import { formatYearLocale } from '../locale.js';

// ── Constants ──
const PROFILES_INDEX = '/people/profiles/index.json';
const PROFILES_DIR = '/people/profiles';

// ── Canvas marker cache ──
const markerCache = new Map();

function cachedMarker(key, draw) {
  if (markerCache.has(key)) return markerCache.get(key);
  const s = 40;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  draw(ctx, s);
  const uri = c.toDataURL();
  markerCache.set(key, uri);
  return uri;
}

// Current position: elegant gold pulsing ring + inner dot
function getPosMarker() {
  return cachedMarker('pos_v2', (ctx, s) => {
    const cx = s / 2, cy = s / 2, r = s * 0.45;
    const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    g.addColorStop(0, 'rgba(255,215,0,0.6)');
    g.addColorStop(0.6, 'rgba(255,215,0,0.15)');
    g.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
  });
}

function getPinMarker(color, label) {
  const key = 'pin_' + color + '_' + (label || '');
  return cachedMarker(key, (ctx, s) => {
    const cx = s / 2, cy = s * 0.42;
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(cx, s - 3);
    ctx.bezierCurveTo(cx - 8, cy + 12, cx - 10, cy + 2, cx - 8, cy - 4);
    ctx.bezierCurveTo(cx - 6, cy - 10, cx, cy - 14, cx, cy - 11);
    ctx.bezierCurveTo(cx, cy - 14, cx + 6, cy - 10, cx + 8, cy - 4);
    ctx.bezierCurveTo(cx + 10, cy + 2, cx + 8, cy + 12, cx, s - 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(cx - 2, cy - 3, 4, 0, Math.PI * 2); ctx.fill();
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + 3);
    }
  });
}

function getDotMarker(color) {
  const key = 'dot_' + color;
  return cachedMarker(key, (ctx, s) => {
    const cx = s / 2, cy = s / 2;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 0.45);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color + '88');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.stroke();
  });
}

// ── Plugin ──
export default {
  name: 'trajectory-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const viewer = core.viewer;

    // ── State ──
    let trajectoryData = null;
    let currentIndex = -1;
    let isPlaying = false;
    let playTimer = null;
    let personList = [];
    let listOpen = false;
    let evalTab = 'supporter'; // current evaluation tab

    /** @type {{ path, posMarker, startMarker, endMarker, waypoints: [] }} */
    const ents = { path: null, posMarker: null, startMarker: null, endMarker: null, waypoints: [] };

    // ── Inject styles ──
    const style = document.createElement('style');
    style.textContent = `
      #traj-toggle {
        position: fixed; left: 10px; top: 100px; z-index: 110;
        background: var(--bg-panel); border: 1px solid var(--border-secondary); border-radius: 6px;
        color: var(--btn-text); font-size: 13px; padding: 6px 10px; cursor: pointer;
        transition: left 0.25s ease, background 0.2s, border-color 0.2s, color 0.2s; font-family: inherit; line-height: 1;
      }
      #traj-toggle:hover { background: var(--btn-hover); color: var(--text-white); }
      #traj-toggle.active { background: var(--accent-blue); border-color: var(--border-accent-hover); color: var(--text-white); }

      #traj-list {
        position: fixed; left: 0; top: 0; bottom: 200px; width: 0;
        z-index: 105; overflow: hidden;
        background: var(--bg-panel-solid);
        border-right: 1px solid var(--border-secondary);
        display: flex; flex-direction: column;
        transition: width 0.25s ease;
      }
      #traj-list.open { width: 290px; }
      @media (max-width: 768px) { #traj-list.open { width: 240px; } }

      #traj-list .tl-header {
        padding: 10px 14px; border-bottom: 1px solid var(--divider); flex-shrink: 0;
      }
      #traj-list .tl-header h3 {
        color: var(--accent-gold); font-size: 15px; margin: 0 0 4px;
      }
      #traj-list .tl-sub {
        color: var(--text-dim); font-size: 11px;
      }
      #traj-list .tl-search {
        width: 100%; box-sizing: border-box; margin-top: 6px;
        background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 14px;
        color: var(--text-primary); font-size: 12px; padding: 4px 10px; font-family: inherit;
        outline: none;
      }
      #traj-list .tl-search:focus { border-color: var(--border-accent-hover); }
      #traj-list .tl-search::placeholder { color: var(--filter-dot-border); }

      #traj-list .tl-list {
        flex: 1; overflow-y: auto; padding: 6px 0;
      }
      #traj-list .tl-list::-webkit-scrollbar { width: 4px; }
      #traj-list .tl-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

      #traj-list .tl-item {
        padding: 8px 14px; cursor: pointer;
        transition: background 0.15s; border-left: 3px solid transparent;
      }
      #traj-list .tl-item:hover { background: rgba(255,215,0,0.1); }
      #traj-list .tl-item.active {
        background: rgba(255,215,0,0.15);
        border-left-color: var(--accent-gold);
      }
      #traj-list .tl-name {
        font-size: 14px; color: var(--accent-gold); font-weight: bold;
      }
      #traj-list .tl-life {
        font-size: 11px; color: var(--text-dim); margin-left: 6px;
      }
      #traj-list .tl-nationality {
        display: inline-block; font-size: 10px; padding: 1px 6px;
        border-radius: 8px; background: rgba(138,180,248,0.15); color: var(--text-link);
        margin-left: 4px;
      }
      #traj-list .tl-stops {
        font-size: 11px; color: #aaa; margin-top: 2px;
      }

      /* Bottom nav panel */
      #traj-panel {
        position: fixed; bottom: 210px; left: 50%; transform: translateX(-50%);
        z-index: 90; display: none; pointer-events: none;
      }
      #traj-panel.visible { display: block; }
      #traj-panel > * { pointer-events: auto; }

      #traj-panel .traj-inner {
        background: var(--bg-panel-solid);
        border: 1px solid var(--border-secondary); border-radius: 12px;
        padding: 8px 14px;
        backdrop-filter: blur(8px);
        min-width: 480px; max-width: 720px;
      }
      #traj-panel .traj-row {
        display: flex; align-items: center; gap: 8px;
      }
      #traj-panel .traj-row + .traj-row { margin-top: 4px; }

      #traj-panel .traj-person-badge {
        color: var(--accent-gold); font-size: 13px; font-weight: bold; white-space: nowrap;
      }
      #traj-panel .traj-life {
        color: var(--text-dim); font-size: 11px; white-space: nowrap;
      }
      #traj-panel .traj-progress {
        color: #aaa; font-size: 12px; white-space: nowrap; margin-left: auto;
      }
      #traj-panel .traj-place-info {
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 1;
      }
      #traj-panel .traj-place-name {
        color: var(--text-link); font-size: 14px; font-weight: bold;
      }
      #traj-panel .traj-place-year {
        color: var(--text-dim); font-size: 11px;
      }
      #traj-panel .traj-place-title {
        display: inline-block; font-size: 10px; padding: 1px 6px;
        border-radius: 8px; background: rgba(138,180,248,0.15); color: var(--text-link);
      }
      #traj-panel .traj-btns {
        display: flex; align-items: center; gap: 4px;
      }
      #traj-panel .traj-btn {
        background: var(--btn-bg); border: 1px solid var(--btn-border);
        color: var(--btn-text); padding: 5px 10px; border-radius: 5px;
        cursor: pointer; font-size: 14px; line-height: 1;
        transition: all 0.15s;
      }
      #traj-panel .traj-btn:hover { background: var(--btn-hover); color: var(--text-white); }
      #traj-panel .traj-btn.playing { background: var(--accent-red); border-color: var(--accent-red-border); }
      #traj-panel .traj-btn:disabled { opacity: 0.3; cursor: not-allowed; }

      /* Detail card */
      #traj-card {
        position: fixed; top: 50%; right: 20px; transform: translateY(-50%);
        background: linear-gradient(145deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%);
        border: 1px solid rgba(255,215,0,0.33); border-radius: 14px;
        z-index: 1000; width: 420px; max-width: 90vw; max-height: 85vh;
        box-shadow: 0 12px 50px var(--card-shadow);
        display: none; color: var(--text-primary); overflow: hidden;
        flex-direction: column;
      }
      #traj-card.visible { display: flex; animation: cardFadeIn 0.25s ease-out; }
      @keyframes cardFadeIn {
        from { opacity: 0; transform: translateY(-50%) translateX(20px); }
        to   { opacity: 1; transform: translateY(-50%) translateX(0); }
      }
      #traj-card .tc-header {
        padding: 14px 18px 10px; border-bottom: 1px solid var(--divider);
        display: flex; justify-content: space-between; align-items: flex-start;
        flex-shrink: 0;
      }
      #traj-card .tc-header h3 { color: var(--accent-gold); font-size: 17px; margin: 0; padding-right: 16px; }
      #traj-card .tc-header .close-btn {
        background: none; border: none; color: var(--text-faint); font-size: 18px;
        cursor: pointer; padding: 0; line-height: 1;
      }
      #traj-card .tc-header .close-btn:hover { color: var(--text-white); }
      #traj-card .tc-body {
        padding: 10px 18px 16px; overflow-y: auto; flex: 1;
      }
      #traj-card .tc-body::-webkit-scrollbar { width: 4px; }
      #traj-card .tc-body::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

      #traj-card .tc-meta { display: flex; gap: 10px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
      #traj-card .tc-year-badge {
        color: var(--text-link); font-size: 14px; font-weight: bold;
        background: var(--accent-blue-bg); padding: 2px 10px; border-radius: 10px;
      }
      #traj-card .tc-title-badge {
        font-size: 11px; padding: 2px 10px; border-radius: 10px;
        background: rgba(255,215,0,0.15); color: var(--accent-gold);
      }
      #traj-card .tc-place { font-size: 22px; color: var(--text-white); margin-bottom: 4px; }
      #traj-card .tc-coords { font-size: 11px; color: var(--text-very-faint); margin-bottom: 8px; }
      #traj-card .tc-desc { font-size: 13px; color: #bbb; line-height: 1.7; }

      /* Evaluation tabs */
      #traj-card .tc-eval { margin-top: 12px; border-top: 1px solid var(--divider); padding-top: 10px; }
      #traj-card .tc-eval-label {
        font-size: 10px; color: var(--text-very-faint); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;
      }
      #traj-card .tc-eval-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
      #traj-card .tc-eval-tab {
        font-size: 11px; padding: 3px 10px; border-radius: 12px; cursor: pointer;
        background: rgba(138,180,248,0.08); color: var(--text-faint);
        border: 1px solid transparent; transition: all 0.15s; user-select: none;
      }
      #traj-card .tc-eval-tab:hover { background: rgba(138,180,248,0.18); color: #aaa; }
      #traj-card .tc-eval-tab.active {
        background: rgba(255,215,0,0.15); color: var(--accent-gold); border-color: rgba(255,215,0,0.33);
      }
      #traj-card .tc-eval-text { font-size: 12px; color: #aaa; line-height: 1.6; }

      /* Quotes */
      #traj-card .tc-quotes { margin-top: 10px; border-top: 1px solid var(--divider); padding-top: 10px; }
      #traj-card .tc-quote-item { margin-bottom: 8px; }
      #traj-card .tc-quote-label {
        font-size: 10px; color: var(--text-very-faint); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;
      }
      #traj-card .tc-quote-text {
        font-size: 12px; color: #ffd700aa; font-style: italic; line-height: 1.5;
      }
      #traj-card .tc-quote-by { font-size: 10px; color: var(--text-very-faint); margin-top: 1px; }

      #traj-card .tc-nav {
        display: flex; gap: 6px; margin-top: 10px; padding-top: 10px;
        border-top: 1px solid var(--divider);
      }
      #traj-card .tc-nav button {
        flex: 1; background: var(--btn-bg); border: 1px solid var(--btn-border); color: var(--btn-text);
        padding: 6px; border-radius: 5px; cursor: pointer; font-size: 12px;
      }
      #traj-card .tc-nav button:hover { background: var(--btn-hover); color: var(--text-white); }
      #traj-card .tc-nav button:disabled { opacity: 0.3; cursor: not-allowed; }

      @media (max-width: 768px) {
        #traj-panel .traj-inner { min-width: auto; }
        #traj-panel .traj-row { flex-wrap: wrap; }
        #traj-card { width: 320px; }
      }
    `;
    document.head.appendChild(style);

    // ── Toggle button ──
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'traj-toggle';
    toggleBtn.textContent = '⏳ 人物轨迹';
    toggleBtn.title = '打开人物列表';

    // ── Left person list panel ──
    const listPanel = document.createElement('div');
    listPanel.id = 'traj-list';
    listPanel.innerHTML = `
      <div class="tl-header">
        <h3>⏳ 人物轨迹</h3>
        <div class="tl-sub" id="tl-sub"></div>
        <input class="tl-search" id="tl-search" type="text" placeholder="搜索人物姓名...">
      </div>
      <div class="tl-list" id="tl-list"></div>
    `;

    // ── Bottom nav panel ──
    const panel = document.createElement('div');
    panel.id = 'traj-panel';
    panel.innerHTML = `
      <div class="traj-inner">
        <div class="traj-row">
          <span class="traj-person-badge" id="traj-person-name"></span>
          <span class="traj-life" id="traj-person-life"></span>
        </div>
        <div class="traj-row" style="flex-wrap:wrap;">
          <div class="traj-place-info">
            <span class="traj-place-name" id="traj-place"></span>
            <span class="traj-place-title" id="traj-title"></span>
            <span class="traj-place-year" id="traj-year"></span>
          </div>
          <span class="traj-progress" id="traj-progress"></span>
          <div class="traj-btns">
            <button class="traj-btn" id="traj-prev" title="上一步 (↑)">◀</button>
            <button class="traj-btn" id="traj-play" title="自动播放 (Enter)">▶</button>
            <button class="traj-btn" id="traj-next" title="下一步 (↓)">▶</button>
          </div>
        </div>
        <div class="traj-row">
          <span class="traj-desc" id="traj-desc" style="font-size:12px;color:#999;line-height:1.4;"></span>
        </div>
      </div>
    `;

    // ── Detail card ──
    const card = document.createElement('div');
    card.id = 'traj-card';
    card.innerHTML = `
      <div class="tc-header">
        <h3 id="tc-person"></h3>
        <button class="close-btn" id="tc-close">✕</button>
      </div>
      <div class="tc-body">
        <div class="tc-meta">
          <span class="tc-year-badge" id="tc-year"></span>
          <span class="tc-title-badge" id="tc-title"></span>
        </div>
        <div class="tc-place" id="tc-place"></div>
        <div class="tc-coords" id="tc-coords"></div>
        <div class="tc-desc" id="tc-desc"></div>
        <div class="tc-eval" id="tc-eval">
          <div class="tc-eval-label">综合评价</div>
          <div class="tc-eval-tabs" id="tc-eval-tabs">
            <span class="tc-eval-tab active" data-tab="supporter">支持者视角</span>
            <span class="tc-eval-tab" data-tab="critic">批评者视角</span>
            <span class="tc-eval-tab" data-tab="objective">历史/流行文化</span>
          </div>
          <div class="tc-eval-text" id="tc-eval-text"></div>
        </div>
        <div class="tc-quotes" id="tc-quotes">
          <div class="tc-quote-item" id="tc-quote-self">
            <div class="tc-quote-label">经典原话</div>
            <div class="tc-quote-text" id="tc-quote-self-text"></div>
          </div>
          <div class="tc-quote-item" id="tc-quote-others">
            <div class="tc-quote-label">他人评价</div>
            <div class="tc-quote-text" id="tc-quote-others-text"></div>
            <div class="tc-quote-by" id="tc-quote-others-by"></div>
          </div>
        </div>
        <div class="tc-nav">
          <button id="tc-prev" disabled>◀ 上一步</button>
          <button id="tc-auto">▶ 自动播放</button>
          <button id="tc-next">下一步 ▶</button>
        </div>
      </div>
    `;

    document.body.append(toggleBtn, listPanel, panel, card);

    // ── DOM refs ──
    const listContainer = listPanel.querySelector('#tl-list');
    const listSub = listPanel.querySelector('#tl-sub');
    const personNameEl = panel.querySelector('#traj-person-name');
    const personLifeEl = panel.querySelector('#traj-person-life');
    const placeEl = panel.querySelector('#traj-place');
    const yearEl = panel.querySelector('#traj-year');
    const titleEl = panel.querySelector('#traj-title');
    const progressEl = panel.querySelector('#traj-progress');
    const prevBtn = panel.querySelector('#traj-prev');
    const nextBtn = panel.querySelector('#traj-next');
    const playBtn = panel.querySelector('#traj-play');
    const descEl = panel.querySelector('#traj-desc');
    const searchInput = listPanel.querySelector('#tl-search');

    // ── Core logic ──

    function clearCesiumEntities() {
      Object.values(ents).forEach(e => {
        if (Array.isArray(e)) e.forEach(x => viewer.entities.remove(x));
        else if (e) viewer.entities.remove(e);
      });
      ents.path = null;
      ents.posMarker = null;
      ents.startMarker = null;
      ents.endMarker = null;
      ents.waypoints = [];
    }

    function renderPath(data) {
      clearCesiumEntities();
      if (!data?.points?.length) return;
      const pts = data.points;
      if (pts.length < 2) return;

      const positions = pts.map(p => Cesium.Cartesian3.fromDegrees(p.coords[0], p.coords[1]));

      ents.path = viewer.entities.add({
        polyline: {
          positions,
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.fromCssColorString('#ffd700'),
          }),
          arcType: Cesium.ArcType.GEODESIC,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 20e6),
        },
      });

      ents.startMarker = viewer.entities.add({
        position: positions[0],
        billboard: { image: getPinMarker('#2ecc71', '起'), verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15e6) },
      });

      ents.endMarker = viewer.entities.add({
        position: positions[positions.length - 1],
        billboard: { image: getPinMarker('#e74c3c', '终'), verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15e6) },
      });

      for (let i = 1; i < pts.length - 1; i++) {
        const w = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(pts[i].coords[0], pts[i].coords[1]),
          billboard: { image: getDotMarker('#8ab4f8'), verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12e6) },
        });
        ents.waypoints.push(w);
      }
    }

    function updatePosMarker(index, pts) {
      if (ents.posMarker) { viewer.entities.remove(ents.posMarker); ents.posMarker = null; }
      if (index < 0 || index >= pts.length) return;
      const p = pts[index];
      ents.posMarker = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p.coords[0], p.coords[1]),
        billboard: {
          image: getPosMarker(),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.6, 10e6, 0.3),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 20e6),
        },
      });
    }

    function flyTo(index, pts) {
      if (index < 0 || index >= pts.length) return;
      const p = pts[index];
      const mode = core.state.get('mapMode') ?? '3d';
      if (mode === '2d') {
        const m2 = core.state.get('_map2d');
        if (m2) m2.flyTo(p.coords[0], p.coords[1], 5);
      } else {
        const tgt = Cesium.Cartesian3.fromDegrees(p.coords[0], p.coords[1]);
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(tgt, 50000),
          {
            duration: 1.6,
            offset: new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(15),
              Cesium.Math.toRadians(-55),
              1200000,
            ),
          },
        );
      }
    }

    function updateUI(index, data) {
      if (!data || index < 0 || index >= data.points.length) {
        card.classList.remove('visible');
        return;
      }
      const p = data.points[index];
      const locale = core.state.get('locale') ?? 'zh';

      // Bottom panel
      personNameEl.textContent = data.name;
      personLifeEl.textContent = `${data.birth || '?'}–${data.death || '?'} · ${data.nationality || ''}`;
      placeEl.textContent = p.place;
      titleEl.textContent = locale === 'en' ? (p.titleEn || '') : (p.title || '');
      titleEl.style.display = (p.title || p.titleEn) ? '' : 'none';
      yearEl.textContent = formatYearLocale(p.year, locale) + (p.yearEnd ? `–${formatYearLocale(p.yearEnd, locale)}` : '');
      progressEl.textContent = `${index + 1}/${data.points.length}`;
      prevBtn.disabled = index <= 0;
      nextBtn.disabled = index >= data.points.length - 1;
      descEl.textContent = locale === 'en' ? (p.descriptionEn || '') : (p.description || '');

      // Detail card
      card.classList.add('visible');
      document.getElementById('tc-person').textContent = `${data.name} · 第${index + 1}站`;
      document.getElementById('tc-year').textContent = yearEl.textContent;
      document.getElementById('tc-title').textContent = locale === 'en' ? (p.titleEn || '') : (p.title || '');
      document.getElementById('tc-place').textContent = p.place;
      document.getElementById('tc-coords').textContent =
        `${p.coords[1].toFixed(3)}°N, ${p.coords[0].toFixed(3)}°E`;
      document.getElementById('tc-desc').textContent =
        locale === 'en' ? (p.descriptionEn || '') : (p.description || '');

      // Evaluation
      const evalDiv = document.getElementById('tc-eval');
      const evalText = document.getElementById('tc-eval-text');
      if (data.evaluation) {
        evalDiv.style.display = '';
        const evalData = data.evaluation[evalTab];
        evalText.textContent = evalData ? (locale === 'en' ? (evalData.en || '') : (evalData.zh || '')) : '';
      } else {
        evalDiv.style.display = 'none';
      }

      // Quotes
      const quotesDiv = document.getElementById('tc-quotes');
      if (data.quotes) {
        quotesDiv.style.display = '';
        const qSelf = document.getElementById('tc-quote-self');
        const qOthers = document.getElementById('tc-quote-others');
        if (data.quotes.self) {
          qSelf.style.display = '';
          document.getElementById('tc-quote-self-text').textContent =
            locale === 'en' ? (data.quotes.self.en || '') : (data.quotes.self.zh || '');
        } else {
          qSelf.style.display = 'none';
        }
        if (data.quotes.others) {
          qOthers.style.display = '';
          document.getElementById('tc-quote-others-text').textContent =
            locale === 'en' ? (data.quotes.others.en || '') : (data.quotes.others.zh || '');
          document.getElementById('tc-quote-others-by').textContent =
            locale === 'en'
              ? (data.othersByEn ? `—— ${data.othersByEn}` : '')
              : (data.othersBy ? `—— ${data.othersBy}` : '');
        } else {
          qOthers.style.display = 'none';
        }
      } else {
        quotesDiv.style.display = 'none';
      }

      document.getElementById('tc-prev').disabled = index <= 0;
      document.getElementById('tc-next').disabled = index >= data.points.length - 1;

      // Highlight active person in left list
      listContainer.querySelectorAll('.tl-item.active').forEach(el => el.classList.remove('active'));
      const activeItem = listContainer.querySelector(`[data-id="${data.personId}"]`);
      if (activeItem) activeItem.classList.add('active');

      if (p.year) core.state.set('currentYear', p.year);
    }

    function goTo(index, data) {
      if (!data) return;
      const clamped = Math.max(0, Math.min(index, data.points.length - 1));
      if (clamped === currentIndex) return;
      currentIndex = clamped;
      updatePosMarker(currentIndex, data.points);
      flyTo(currentIndex, data.points);
      updateUI(currentIndex, data);
    }

    function stopPlay() {
      if (playTimer) clearInterval(playTimer);
      playTimer = null;
      isPlaying = false;
      playBtn.textContent = '▶';
      playBtn.classList.remove('playing');
      document.getElementById('tc-auto').textContent = '▶ 自动播放';
    }

    function startPlay(data) {
      if (!data || currentIndex >= data.points.length - 1) return;
      isPlaying = true;
      playBtn.textContent = '⏸';
      playBtn.classList.add('playing');
      document.getElementById('tc-auto').textContent = '⏸ 暂停';
      playTimer = setInterval(() => {
        const next = currentIndex + 1;
        if (next >= data.points.length) { stopPlay(); return; }
        goTo(next, data);
      }, 2500);
    }

    function renderList(filter) {
      const listEl = listContainer;
      listEl.innerHTML = '';
      const q = (filter || '').toLowerCase();
      let filtered = personList;
      if (q) {
        filtered = filtered.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
          (p.nationality && p.nationality.includes(q)));
      }
      listSub.textContent = `${filtered.length}/${personList.length} 位人物`;
      for (const p of filtered) {
        const item = document.createElement('div');
        item.className = 'tl-item';
        item.dataset.id = p.personId;
        item.innerHTML = `
          <div>
            <span class="tl-name">${p.name}</span>
            <span class="tl-nationality">${p.nationality || ''}</span>
            <span class="tl-life">${p.birth || '?'}–${p.death || '?'}</span>
          </div>
          <div class="tl-stops">${p.totalPoints} 个地点</div>
        `;
        item.addEventListener('click', () => selectPerson(p.personId));
        listEl.appendChild(item);
      }
    }

    function loadPersonList() {
      fetch(PROFILES_INDEX)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(list => {
          personList = list;
          listSub.textContent = `${list.length} 位人物`;
          searchInput.addEventListener('input', () => renderList(searchInput.value));
          renderList('');
        })
        .catch(e => console.warn('[traj] load list:', e));
    }

    async function loadTrajectory(id) {
      try {
        const r = await fetch(`${PROFILES_DIR}/${id}.json`);
        return r.ok ? r.json() : null;
      } catch { return null; }
    }

    // ── Person selection handler ──
    async function selectPerson(personId) {
      stopPlay();
      clearCesiumEntities();
      card.classList.remove('visible');
      evalTab = 'supporter';

      if (!personId) {
        panel.classList.remove('visible');
        trajectoryData = null;
        currentIndex = -1;
        return;
      }

      const data = await loadTrajectory(personId);
      if (!data?.points?.length || data.points.length < 2) {
        console.warn('[traj] insufficient data');
        return;
      }

      trajectoryData = data;
      currentIndex = -1;
      panel.classList.add('visible');
      renderPath(data);
      goTo(0, data);

      // Reset eval tabs
      document.querySelectorAll('#tc-eval-tabs .tc-eval-tab').forEach(t => t.classList.remove('active'));
      const firstTab = document.querySelector('#tc-eval-tabs .tc-eval-tab[data-tab="supporter"]');
      if (firstTab) firstTab.classList.add('active');
    }

    // ── Toggle left list ──
    toggleBtn.addEventListener('click', () => {
      listOpen = !listOpen;
      listPanel.classList.toggle('open', listOpen);
      toggleBtn.classList.toggle('active', listOpen);
      toggleBtn.style.left = listOpen ? '300px' : '10px';
    });

    // ── Nav buttons ──
    prevBtn.addEventListener('click', () => { if (trajectoryData) goTo(currentIndex - 1, trajectoryData); });
    nextBtn.addEventListener('click', () => { if (trajectoryData) goTo(currentIndex + 1, trajectoryData); });
    playBtn.addEventListener('click', () => {
      if (!trajectoryData) return;
      isPlaying ? stopPlay() : startPlay(trajectoryData);
    });

    // ── Card buttons ──
    document.getElementById('tc-prev').addEventListener('click', () => {
      if (trajectoryData) { stopPlay(); goTo(currentIndex - 1, trajectoryData); }
    });
    document.getElementById('tc-next').addEventListener('click', () => {
      if (trajectoryData) { stopPlay(); goTo(currentIndex + 1, trajectoryData); }
    });
    document.getElementById('tc-auto').addEventListener('click', () => {
      if (!trajectoryData) return;
      isPlaying ? stopPlay() : startPlay(trajectoryData);
    });
    document.getElementById('tc-close').addEventListener('click', () => {
      card.classList.remove('visible');
    });

    // ── Evaluation tabs ──
    document.getElementById('tc-eval-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tc-eval-tab');
      if (!tab) return;
      evalTab = tab.dataset.tab;
      document.querySelectorAll('#tc-eval-tabs .tc-eval-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (trajectoryData && currentIndex >= 0) updateUI(currentIndex, trajectoryData);
    });

    // ── Close on Escape ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (listOpen) {
          listOpen = false;
          listPanel.classList.remove('open');
          toggleBtn.classList.remove('active');
          toggleBtn.style.left = '10px';
        }
        card.classList.remove('visible');
      }
    });

    // ── Close card on click outside ──
    document.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */(e.target);
      if (card.classList.contains('visible') &&
          !card.contains(t) && !t.closest('#traj-panel') && !t.closest('#traj-toggle') && !t.closest('#traj-list')) {
        card.classList.remove('visible');
      }
    });

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', (e) => {
      if (!trajectoryData) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); stopPlay(); goTo(currentIndex - 1, trajectoryData); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); stopPlay(); goTo(currentIndex + 1, trajectoryData); }
      else if (e.key === 'Enter') { e.preventDefault(); isPlaying ? stopPlay() : startPlay(trajectoryData); }
    });

    // ── React to locale ──
    core.state.on('locale', () => {
      if (trajectoryData && currentIndex >= 0) updateUI(currentIndex, trajectoryData);
    });
    core.state.on('mapMode', () => {
      if (trajectoryData && currentIndex >= 0) flyTo(currentIndex, trajectoryData.points);
    });

    // ── Click on Cesium trajectory entity opens card ──
    const h = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    h.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (!Cesium.defined(picked)) return;
      const e = picked.id;
      if (!e) return;
      if (e === ents.path || e === ents.startMarker || e === ents.endMarker ||
          e === ents.posMarker || ents.waypoints.includes(e)) {
        if (trajectoryData && currentIndex >= 0) card.classList.add('visible');
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // ── Init ──
    loadPersonList();
  },
};
