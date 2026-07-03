/**
 * Layers plugin – base imagery switcher + historical polity borders.
 *
 * Features:
 *  - 4 base layers (default: OpenStreetMap standard map)
 *  - Historical polity borders from Cliopatria, synced to timeline
 *  - Country name labels on all borders
 *  - Modern Natural Earth borders as toggleable fallback
 */

import * as Cesium from 'cesium';
import { createMap2DRenderer } from './map2d-renderer.js';
import { t } from '../locale.js';

// ═══════════════════════════════════════════
//  Imagery providers  (2 layers only: standard + satellite)
// ═══════════════════════════════════════════
const BASE_LAYERS = [
  {
    id: 'standard',
    label: '标准地图',
    labelEn: 'Standard',
    factory: () =>
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'],
        credit: '© OpenStreetMap contributors',
      }),
  },
  {
    id: 'satellite',
    label: '卫星地图',
    labelEn: 'Satellite',
    factory: () =>
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: 'ESRI World Imagery',
      }),
  },
];

const DEFAULT_BASE_LAYER = 'satellite';
const POLITIES_BASE = '/ne/polities/';
const CENTURY_WINDOW = 100;
const MAX_POLITIES = 800; // safety cap – prevents Cesium entity overflow

// ── GeoJSON → Cesium entities (no GeoJsonDataSource) ──

function geoRingToPositions(ring) {
  const pts = [];
  for (let i = 0; i < ring.length; i++) {
    pts.push(Cesium.Cartesian3.fromDegrees(ring[i][0], ring[i][1]));
  }
  return pts;
}

function geoPolyToHierarchy(coords) {
  const outer = geoRingToPositions(coords[0]);
  const holes = [];
  for (let h = 1; h < coords.length; h++) {
    holes.push(new Cesium.PolygonHierarchy(geoRingToPositions(coords[h])));
  }
  return new Cesium.PolygonHierarchy(outer, holes);
}

function geoCentroid(geometry) {
  let sumLon = 0, sumLat = 0, count = 0;
  function walk(ring) {
    for (const c of ring) { sumLon += c[0]; sumLat += c[1]; count++; }
  }
  if (geometry.type === 'Polygon') {
    walk(geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) walk(poly[0]);
  }
  return count > 0 ? [sumLon / count, sumLat / count] : [0, 0];
}
const GOLDEN_ANGLE = 0.618033988749895;

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

function polityFillColor(name) {
  const hash = hashStr(name || 'unknown');
  const hue = ((hash * GOLDEN_ANGLE) % 1) * 360;
  return Cesium.Color.fromHsl(
    hue / 360,
    0.50 + (hash % 3) * 0.04,
    0.55 + (hash % 2) * 0.06,
    1.0,
  );
}

function polityStrokeColor(name) {
  const hash = hashStr(name || 'unknown');
  const hue = ((hash * GOLDEN_ANGLE) % 1) * 360;
  return Cesium.Color.fromHsl(hue / 360, 0.60, 0.40, 1.0);
}

// ═══════════════════════════════════════════
//  Panel
// ═══════════════════════════════════════════
function createPanel() {
  const panel = document.createElement('div');
  panel.id = 'layers-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '80px',
    right: '10px',
    zIndex: '100',
    background: 'rgba(10,10,26,0.9)',
    border: '1px solid #3a3a5a',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#ccc',
    fontSize: '13px',
    minWidth: '180px',
    maxHeight: 'calc(100vh - 300px)',
    overflowY: 'auto',
    userSelect: 'none',
  });
  return panel;
}

// ═══════════════════════════════════════════
//  Plugin
// ═══════════════════════════════════════════
export default {
  name: 'layers-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const viewer = core.viewer;
    const panel = createPanel();
    document.body.appendChild(panel);

    // ── Base Layer Section ──
    const baseTitle = document.createElement('div');
    baseTitle.style.cssText = 'color:#ffd700;font-weight:bold;margin-bottom:6px;';
    panel.appendChild(baseTitle);

    const baseBtns = document.createElement('div');
    baseBtns.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:12px;';
    panel.appendChild(baseBtns);

    let activeBaseId = DEFAULT_BASE_LAYER;
    /** @type {Object<string, import('cesium').ImageryLayer>} */
    const imageryLayerMap = {};

    function updateBtnStyles() {
      baseBtns.querySelectorAll('button.baselayer-btn').forEach((b) => {
        const sel = b.dataset.layerId === activeBaseId;
        b.style.background = sel ? '#4a60af' : '#2a2a4a';
        b.style.borderColor = sel ? '#6a80cf' : '#4a4a7a';
      });
    }

    async function switchBaseLayer(layerDef) {
      if (!imageryLayerMap[layerDef.id]) return;
      Object.entries(imageryLayerMap).forEach(([id, layer]) => {
        layer.show = (id === layerDef.id);
      });
      activeBaseId = layerDef.id;
      applyPolityFillMode();
      updateBtnStyles();
    }

    /** When satellite is active, hide polity fills, modern borders provide the lines. */
    function applyPolityFillMode() {
      if (!politiesEntities) { console.warn('[layers] applyPolityFillMode: no entities'); return; }
      const isSatellite = activeBaseId === 'satellite';
      for (const ent of politiesEntities) {
        if (isSatellite) {
          ent.polygon.material = Cesium.Color.TRANSPARENT;
          ent.polygon.outlineColor = Cesium.Color.TRANSPARENT;
          ent.polygon.outlineWidth = 0;
        } else {
          const mats = polityOriginalMaterials.get(ent);
          if (mats) {
            ent.polygon.material = mats.fill;
            ent.polygon.outlineColor = mats.stroke;
            ent.polygon.outlineWidth = 1.5;
          }
        }
      }
    }

    for (const layer of BASE_LAYERS) {
      const btn = document.createElement('button');
      btn.textContent = layer.label;
      btn.className = 'baselayer-btn';
      btn.dataset.layerId = layer.id;
      Object.assign(btn.style, {
        background: layer.id === DEFAULT_BASE_LAYER ? '#4a60af' : '#2a2a4a',
        border: '1px solid',
        borderColor: layer.id === DEFAULT_BASE_LAYER ? '#6a80cf' : '#4a4a7a',
        color: '#ccc',
        padding: '4px 8px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px',
        textAlign: 'left',
      });
      btn.addEventListener('click', () => switchBaseLayer(layer));
      baseBtns.appendChild(btn);
    }

    // Init: preload both layers and show only the default
    (async () => {
      if (viewer.imageryLayers.length > 0) {
        viewer.imageryLayers.remove(viewer.imageryLayers.get(0));
      }
      for (const layer of BASE_LAYERS) {
        try {
          const provider = await layer.factory();
          const cesiumLayer = viewer.imageryLayers.addImageryProvider(provider, 0);
          cesiumLayer.show = (layer.id === DEFAULT_BASE_LAYER);
          imageryLayerMap[layer.id] = cesiumLayer;
        } catch (err) {
          console.error('[layers] Failed to preload layer:', layer.id, err);
        }
      }
      updateBtnStyles();
    })();

    // ── Mode: 3D Globe / 2D Map ──
    let currentMode = '3d'; // '3d' or '2d'
    const map2d = createMap2DRenderer(core);
    core.state.set('_map2d', map2d); // expose to other plugins

    const sceneContainer = document.getElementById('cesiumContainer');
    const mapContainer = document.getElementById('map-2d-container');

    function switchMode(mode) {
      if (mode === currentMode) return;
      currentMode = mode;
      const modeBtns = panel.querySelectorAll('button.mode-btn');
      modeBtns.forEach((b) => {
        const sel = b.dataset.mode === mode;
        b.style.background = sel ? '#4a60af' : '#2a2a4a';
        b.style.borderColor = sel ? '#6a80cf' : '#4a4a7a';
      });

      if (mode === '2d') {
        sceneContainer.style.display = 'none';
        mapContainer.style.display = 'block';
        map2d.init(105, 32, 4);
        const year = core.state.get('currentYear') ?? 2025;
        syncPolitiesToYear(year);
      } else {
        mapContainer.style.display = 'none';
        sceneContainer.style.display = 'block';
        map2d.destroy();
        hideFarSideLabels();
      }
      core.state.set('mapMode', mode);
    }

    // ── Settings Dropdown ──
    const settingsHeader = document.createElement('div');
    settingsHeader.style.cssText = 'color:#ffd700;font-weight:bold;margin-bottom:4px;margin-top:4px;cursor:pointer;user-select:none;';
    settingsHeader.textContent = '▶ ' + t('panel.layers.settings', 'zh');
    panel.appendChild(settingsHeader);

    const settingsBody = document.createElement('div');
    settingsBody.style.cssText = 'display:none;margin-bottom:12px;padding:6px 0 0 8px;';
    panel.appendChild(settingsBody);

    settingsHeader.addEventListener('click', () => {
      const isOpen = settingsBody.style.display !== 'none';
      settingsBody.style.display = isOpen ? 'none' : 'block';
      settingsHeader.textContent = (isOpen ? '▶' : '▼') + ' ' + t('panel.layers.settings', core.state.get('locale') ?? 'zh');
    });

    // Language select inside dropdown
    const localeSelect = document.createElement('select');
    localeSelect.style.cssText = 'display:block;width:100%;border:1px solid #4a4a7a;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;background:#2a2a4a;margin-bottom:4px;';
    localeSelect.addEventListener('change', () => {
      core.state.set('locale', localeSelect.value);
    });
    settingsBody.appendChild(localeSelect);

    const LOCALE_OPTIONS = [
      { value: 'zh', label: '中文' },
      { value: 'en', label: 'English' },
    ];

    function updateLocaleSelect(locale) {
      localeSelect.innerHTML = '';
      for (const opt of LOCALE_OPTIONS) {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        el.selected = opt.value === locale;
        localeSelect.appendChild(el);
      }
    }

    updateLocaleSelect(core.state.get('locale') ?? 'zh');

    // ── Update all static labels on locale change ──
    function updateAllLabels() {
      const loc = core.state.get('locale') ?? 'zh';
      baseTitle.textContent = t('panel.layers.base', loc);
      polTitle.textContent = t('panel.layers.historical', loc);
      const arrow = settingsBody.style.display !== 'none' ? '▼' : '▶';
      settingsHeader.textContent = arrow + ' ' + t('panel.layers.settings', loc);
      // Base layer buttons
      baseBtns.querySelectorAll('button.baselayer-btn').forEach((btn) => {
        const layer = BASE_LAYERS.find((l) => l.id === btn.dataset.layerId);
        if (layer) btn.textContent = loc === 'en' ? (layer.labelEn ?? layer.label) : layer.label;
      });
      // Toggle buttons
      const polOn = politiesVisible;
      polToggle.textContent = t(polOn ? 'panel.layers.historical.on' : 'panel.layers.historical.off', loc);
      const modOn = modernVisible;
      modernToggle.textContent = t(modOn ? 'panel.layers.modern.on' : 'panel.layers.modern.off', loc);
    }

    core.state.on('locale', (val) => {
      updateLocaleSelect(val);
      updateAllLabels();
      updateModernLabels();
      // Re-render polities with new locale names
      if (!politiesVisible) return;
      const year = core.state.get('currentYear');
      if (year != null) {
        syncPolitiesToYear(year);
        hideFarSideLabels();
      }
    });

    // Load Chinese name map (must complete before initial polity sync)
    const nameMapPromise = (async () => {
      try {
        const resp = await fetch('/ne/polity_names_zh.json');
        if (resp.ok) core._polityNameMap = await resp.json();
      } catch { /* fallback: no Chinese names */ }
    })();

    // Load polity descriptions (Wikipedia summaries)
    const descriptionMapPromise = (async () => {
      try {
        const resp = await fetch('/ne/polity_descriptions.json');
        if (resp.ok) core._polityDescriptions = await resp.json();
      } catch { /* fallback: no descriptions */ }
    })();

    // Load polity assets (flags, coats of arms, stats)
    const assetsMapPromise = (async () => {
      try {
        const resp = await fetch('/ne/polity_assets.json');
        if (resp.ok) core._polityAssets = await resp.json();
      } catch { /* fallback: no assets */ }
    })();

    // Historical Polities Section
    const polTitle = document.createElement('div');
    polTitle.style.cssText = 'color:#ffd700;font-weight:bold;margin-bottom:4px;';
    panel.appendChild(polTitle);

    const polStatus = document.createElement('div');
    polStatus.style.cssText = 'font-size:11px;color:#888;margin-bottom:6px;';
    panel.appendChild(polStatus);

    const polBtns = document.createElement('div');
    polBtns.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:12px;';
    panel.appendChild(polBtns);

    // Polity state
    let politiesVisible = true;
    let modernVisible = true;
    let syncGeneration = 0; // race-condition guard

    /** @type {Map<string, Array>} century → raw GeoJSON features */
    const centuryCache = new Map();

    /** @type {Set<import('cesium').Entity>|null} */
    let politiesEntities = null;

    /** Remove all Cesium polity entities from the scene. */
    function removeCesiumPolities() {
      if (!politiesEntities) return;
      for (const ent of politiesEntities) viewer.entities.remove(ent);
      politiesEntities = null;
    }

    /** @type {Map<import('cesium').Entity, { fill: import('cesium').Color, stroke: import('cesium').Color }>} */
    const polityOriginalMaterials = new Map();

    /** Create Cesium entities from filtered features. */
    function renderCesiumPolities(features) {
      removeCesiumPolities();
      polityOriginalMaterials.clear();
      closePolityCard();
      const newEntities = new Set();
      const locale = core.state.get('locale') ?? 'zh';
      const nameMap = core._polityNameMap;

      for (const feature of features) {
        const name = feature.properties?.Name || '';
        if (!name) continue;

        const color = polityFillColor(name);
        const stroke = polityStrokeColor(name);
        // Localized name
        const displayName = locale === 'zh' && nameMap
          ? (nameMap[name] || nameMap[name.replace(/^\(|\)$/g, '')] || name)
          : name;
        const shortName = displayName.split(/[,（(]/)[0].trim();
        const [clon, clat] = geoCentroid(feature.geometry);
        const position = Cesium.Cartesian3.fromDegrees(clon, clat);

        function addEntity(polyCoords) {
          const ent = viewer.entities.add({
            position,
            polygon: {
              hierarchy: geoPolyToHierarchy(polyCoords),
              material: color,
              outlineColor: stroke,
              outlineWidth: 1.5,
            },
            label: {
              text: shortName,
              font: locale === 'zh' ? 'bold 15px "Microsoft YaHei", "Noto Sans SC", sans-serif' : 'bold 13px "Microsoft YaHei", "Noto Sans SC", sans-serif',
              fillColor: Cesium.Color.fromCssColorString('#f0e8d8'),
              outlineColor: Cesium.Color.fromCssColorString('#0a0a1a'),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              scaleByDistance: new Cesium.NearFarScalar(5e5, 1.6, 18e6, 0.3),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25e6),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              pixelOffset: new Cesium.Cartesian2(0, -6),
            },
            properties: {
              _polityName: name,
              _polityDisplayName: displayName,
              _polityFrom: feature.properties?.FromYear,
              _polityTo: feature.properties?.ToYear,
              _polityWiki: feature.properties?.Wikipedia,
            },
          });
          polityOriginalMaterials.set(ent, {
            fill: Cesium.Color.clone(color),
            stroke: Cesium.Color.clone(stroke),
          });
          newEntities.add(ent);
        }

        if (feature.geometry.type === 'Polygon') {
          addEntity(feature.geometry.coordinates);
        } else if (feature.geometry.type === 'MultiPolygon') {
          for (const polyCoords of feature.geometry.coordinates) {
            addEntity(polyCoords);
          }
        }
      }

      politiesEntities = newEntities;
      applyPolityFillMode();
    }

    /** @type {import('cesium').GeoJsonDataSource|null} */
    let modernCountriesDS = null;
    /** @type {import('cesium').GeoJsonDataSource|null} */
    let modernLinesDS = null;

    /**
     * Get the century bucket key for a given year.
     * e.g. year=1492 → "1400_1500"
     */
    function centuryKey(year) {
      const start = Math.floor(year / CENTURY_WINDOW) * CENTURY_WINDOW;
      return `${start}_${start + CENTURY_WINDOW}`;
    }

    /**
     * Fetch and cache raw feature array for a century file.
     */
    async function loadCenturyFeatures(key) {
      if (centuryCache.has(key)) return centuryCache.get(key);

      const [start] = key.split('_').map(Number);
      const filename = `polities_${start}_${start + CENTURY_WINDOW}.json`;
      const url = POLITIES_BASE + filename;

      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const geojson = await resp.json();
        const features = geojson.features || [];
        centuryCache.set(key, features);
        return features;
      } catch (err) {
        console.warn(`[layers] Failed to load polities for century ${key}:`, err.message);
        return null;
      }
    }

    /**
     * Update display to show polities active in the given year.
     * Loads century files, filters features by FromYear/ToYear, and creates
     * a fresh GeoJsonDataSource via Blob URL (more reliable than passing JS objects).
     */
    async function syncPolitiesToYear(year) {
      if (!politiesVisible) return;

      const gen = ++syncGeneration;
      const _loc = core.state.get('locale') ?? 'zh';
      polStatus.textContent = `${year} · ${t('loading.status', _loc)}`;

      const currentKey = centuryKey(year);
      const prevKey = centuryKey(year - CENTURY_WINDOW);
      const nextKey = centuryKey(year + CENTURY_WINDOW);

      // Load current + adjacent centuries
      const keys = [...new Set([prevKey, currentKey, nextKey])];
      const featureArrays = [];
      for (const key of keys) {
        const features = await loadCenturyFeatures(key);
        if (features) featureArrays.push(features);
      }

      // Bail if a newer sync started while we were fetching
      if (gen !== syncGeneration) return;

      // Filter features active in the target year
      const activeFeatures = [];
      for (const features of featureArrays) {
        for (let i = 0; i < features.length; i++) {
          const f = features[i];
          const from = f.properties?.FromYear;
          const to = f.properties?.ToYear;
          if (from != null && to != null && year >= from && year <= to) {
            activeFeatures.push(f);
          }
        }
      }

      // Bail if a newer sync started while we were filtering
      if (gen !== syncGeneration) return;

      if (activeFeatures.length === 0) {
        polStatus.textContent = `${year} · ${t('loading.no_data', _loc)}`;
        if (currentMode === '2d') map2d.clearPolities();
        else { removeCesiumPolities(); }
        return;
      }

      // Cap
      let shown = activeFeatures;
      if (activeFeatures.length > MAX_POLITIES) {
        shown = activeFeatures
          .sort((a, b) => (b.properties?.Area || 0) - (a.properties?.Area || 0))
          .slice(0, MAX_POLITIES);
      }

      if (currentMode === '2d') {
        map2d.setPolities(shown);
        polStatus.textContent = `${year} · ${shown.length} ${t('loading.status_suffix', _loc)}`;
      } else {
        renderCesiumPolities(shown);
        hideFarSideLabels();
        const maxPrefix = t('loading.status_suffix', _loc) === 'regions' ? 'showing top' : '显示前';
        const suffix = activeFeatures.length > MAX_POLITIES ? ` (${maxPrefix}${MAX_POLITIES})` : '';
        polStatus.textContent = `${year} · ${politiesEntities?.size ?? 0} ${t('loading.status_suffix', _loc)}${suffix}`;
      }

      // Evict centuries outside the current window
      const keepKeys = new Set([currentKey, prevKey, nextKey]);
      for (const key of centuryCache.keys()) {
        if (!keepKeys.has(key)) centuryCache.delete(key);
      }
    }

    function getLabelForLocale(ent) {
      const locale = core.state.get('locale') ?? 'zh';
      const name = locale === 'zh'
        ? (ent.properties?.NAME_ZH?.getValue() || ent.properties?.NAME?.getValue() || '')
        : (ent.properties?.NAME?.getValue() || '');
      return name;
    }

    function updateModernLabels() {
      if (!modernCountriesDS) return;
      const entities = modernCountriesDS.entities.values;
      for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        const name = getLabelForLocale(ent);
        if (ent.label) ent.label.text = name;
      }
    }

    // ── Far-side label culling ──
    const _scratchA = new Cesium.Cartesian3();
    const _scratchB = new Cesium.Cartesian3();

    function isOnVisibleSide(position, cameraPos, center) {
      Cesium.Cartesian3.subtract(position, center, _scratchA);
      Cesium.Cartesian3.subtract(cameraPos, center, _scratchB);
      Cesium.Cartesian3.normalize(_scratchA, _scratchA);
      Cesium.Cartesian3.normalize(_scratchB, _scratchB);
      return Cesium.Cartesian3.dot(_scratchA, _scratchB) > 0.05;
    }

    function hideFarSideLabels() {
      if (!viewer || !viewer.scene) return;
      const cameraPos = viewer.camera.positionWC;
      const center = Cesium.Cartesian3.ZERO;
      const time = viewer.clock?.currentTime ?? Cesium.JulianDate.now();
      const height = viewer.camera.positionCartographic.height;

      // Label density budget: fewer labels when zoomed far out
      let budget = 1.0;
      if (height > 18e6) budget = 0.08;
      else if (height > 12e6) budget = 0.15;
      else if (height > 8e6) budget = 0.25;
      else if (height > 5e6) budget = 0.40;
      else if (height > 3e6) budget = 0.60;
      else if (height > 1.5e6) budget = 0.80;

      const seed = Math.floor(height / 200000);

      function densityShow(ent) {
        if (budget >= 1.0) return true;
        return (hashStr(ent.id + seed) % 1000) / 1000 < budget;
      }

      // Historical polities
      if (politiesEntities) {
        for (const ent of politiesEntities) {
          if (!ent.label) continue;
          const pos = ent.position?.getValue(time);
          if (!pos) { ent.label.show = false; continue; }
          ent.label.show = isOnVisibleSide(pos, cameraPos, center) && densityShow(ent);
        }
      }

      // Modern countries
      if (modernCountriesDS && modernCountriesDS.show) {
        const entities = modernCountriesDS.entities.values;
        for (let i = 0; i < entities.length; i++) {
          const ent = entities[i];
          if (!ent.label) continue;
          const pos = ent.position?.getValue(time);
          if (!pos) { ent.label.show = false; continue; }
          ent.label.show = isOnVisibleSide(pos, cameraPos, center) && densityShow(ent);
        }
      }
    }

    // ── Modern borders (fallback) ──
    async function loadModernBorders() {
      if (modernCountriesDS) return;
      try {
        modernCountriesDS = await Cesium.GeoJsonDataSource.load(
          '/ne/ne_110m_admin_0_countries.json',
          {
            stroke: Cesium.Color.fromCssColorString('#FFFFFF'),
            strokeWidth: 2.0,
            fill: Cesium.Color.TRANSPARENT,
          },
        );
        const entities = modernCountriesDS.entities.values;
        for (let i = 0; i < entities.length; i++) {
          const ent = entities[i];
          const name = getLabelForLocale(ent);
          if (name) {
            ent.label = {
              text: name,
              font: 'bold 12px "Microsoft YaHei", "Noto Sans SC", sans-serif',
              fillColor: Cesium.Color.fromCssColorString('#d0d8e8'),
              outlineColor: Cesium.Color.fromCssColorString('#0a0a1a'),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              scaleByDistance: new Cesium.NearFarScalar(5e5, 1.6, 18e6, 0.3),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25e6),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              pixelOffset: new Cesium.Cartesian2(0, -4),
            };
          }
        }
        await viewer.dataSources.add(modernCountriesDS);

        modernLinesDS = await Cesium.GeoJsonDataSource.load(
          '/ne/ne_50m_admin_0_boundary_lines_land.json',
          {
            stroke: Cesium.Color.fromCssColorString('#FFFFFF'),
            strokeWidth: 2.0,
          },
        );
        await viewer.dataSources.add(modernLinesDS);

        modernCountriesDS.show = modernVisible;
        modernLinesDS.show = modernVisible;
        console.log('[layers] Modern borders loaded:', modernCountriesDS.entities.values.length, 'countries,', modernLinesDS.entities.values.length, 'lines');
        hideFarSideLabels();
      } catch (err) {
        console.error('[layers] Failed to load modern borders:', err);
      }
    }

    // ── Toggle: Historical Polities ──
    const polToggle = document.createElement('button');
    Object.assign(polToggle.style, {
      background: '#2c6e49',
      border: '1px solid #40916c',
      color: '#ccc',
      padding: '4px 8px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      textAlign: 'left',
    });

    polToggle.addEventListener('click', async () => {
      politiesVisible = !politiesVisible;
      const loc = core.state.get('locale') ?? 'zh';
      if (politiesVisible) {
        polToggle.textContent = t('panel.layers.historical.on', loc);
        polToggle.style.background = '#2c6e49';
        polToggle.style.borderColor = '#40916c';
        const year = core.state.get('currentYear') ?? 2025;
        await syncPolitiesToYear(year);
        hideFarSideLabels();
      } else {
        polToggle.textContent = t('panel.layers.historical.off', loc);
        polToggle.style.background = '#2a2a4a';
        polToggle.style.borderColor = '#4a4a7a';
        if (currentMode === '2d') {
          map2d.clearPolities();
        } else {
          removeCesiumPolities();
        }
        polStatus.textContent = t('status.hidden', loc);
      }
    });
    polBtns.appendChild(polToggle);

    // ── Toggle: Modern Borders ──
    const modernToggle = document.createElement('button');
    Object.assign(modernToggle.style, {
      background: '#2a2a4a',
      border: '1px solid #4a4a7a',
      color: '#ccc',
      padding: '4px 8px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      textAlign: 'left',
    });

    modernToggle.addEventListener('click', async () => {
      modernVisible = !modernVisible;
      const loc = core.state.get('locale') ?? 'zh';
      if (modernVisible) {
        modernToggle.textContent = t('panel.layers.modern.on', loc);
        modernToggle.style.background = '#2c6e49';
        modernToggle.style.borderColor = '#40916c';
        await loadModernBorders();
      } else {
        modernToggle.textContent = t('panel.layers.modern.off', loc);
        modernToggle.style.background = '#2a2a4a';
        modernToggle.style.borderColor = '#4a4a7a';
      }
      if (modernCountriesDS) modernCountriesDS.show = modernVisible;
      if (modernLinesDS) modernLinesDS.show = modernVisible;
      hideFarSideLabels();
    });
    polBtns.appendChild(modernToggle);

    // ── Polity info card ──
    const polityCard = document.createElement('div');
    polityCard.id = 'polity-card';
    Object.assign(polityCard.style, {
      display: 'none',
      position: 'fixed',
      zIndex: '200',
      background: 'rgba(10,10,26,0.93)',
      border: '1px solid #4a4a7a',
      borderRadius: '8px',
      padding: '14px 16px',
      color: '#ddd',
      fontSize: '13px',
      maxWidth: '360px',
      minWidth: '240px',
      maxHeight: '60vh',
      overflowY: 'auto',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(6px)',
      pointerEvents: 'auto',
      lineHeight: '1.6',
    });
    document.body.appendChild(polityCard);

    function showPolityCard(entity) {
      const props = entity.properties;
      if (!props) return;

      const name = props._polityDisplayName?.getValue?.() || props._polityDisplayName || '';
      const wiki = props._polityWiki?.getValue?.() || props._polityWiki || '';
      const from = props._polityFrom?.getValue?.() || props._polityFrom;
      const to = props._polityTo?.getValue?.() || props._polityTo;
      const engName = props._polityName?.getValue?.() || props._polityName || '';

      // Position card near entity (with fallback to center-right)
      const time = viewer.clock?.currentTime ?? Cesium.JulianDate.now();
      const pos = entity.position?.getValue(time);
      let cardLeft = (window.innerWidth - 380) + 'px';
      let cardTop = '80px';
      if (pos) {
        try {
          const screenPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, pos);
          if (screenPos) {
            cardLeft = Math.min(screenPos.x + 16, window.innerWidth - 380) + 'px';
            cardTop = Math.min(screenPos.y + 16, window.innerHeight - 400) + 'px';
          }
        } catch (_) {}
      }
      polityCard.style.left = cardLeft;
      polityCard.style.top = cardTop;

      // Look up description
      const descriptions = core._polityDescriptions;
      let zhDesc = '', enDesc = '', thumbnail = '';
      if (descriptions && wiki) {
        const entry = descriptions[wiki] || descriptions[decodeURIComponent(wiki)] || null;
        if (entry && entry.zh) { zhDesc = entry.zh.extract; thumbnail = entry.zh.thumbnail || ''; }
        if (entry && entry.en && !zhDesc) { enDesc = entry.en.extract; thumbnail = entry.en.thumbnail || ''; }
      }

      // Look up assets (flags, coat of arms, stats)
      const assets = core._polityAssets;
      const assetData = assets ? (assets[wiki] || null) : null;

      const locale = core.state.get('locale') ?? 'zh';
      const yearStr = from != null && to != null
        ? (locale === 'zh' ? `${fmtYear(from)} — ${fmtYear(to)}` : `${fmtYearEn(from)} — ${fmtYearEn(to)}`)
        : '';

      const desc = zhDesc || enDesc || (locale === 'zh' ? '暂无介绍' : 'No description available');
      const descTruncated = desc.length > 800 ? desc.slice(0, 800) + '……' : desc;

      // Build stats line
      const loc = locale === 'zh' ? 1 : 0;
      const L = [
        ['Capital:', 'Pop:', 'Area:', 'Lang:'],
        ['首都：', '人口：', '面积：', '语言：'],
      ];
      let statsHtml = '';
      if (assetData) {
        const parts = [];
        if (assetData.capital) parts.push(`<span><span style="color:#666;">${L[loc][0]}</span> ${escapeHtml(String(assetData.capital))}</span>`);
        if (assetData.population) parts.push(`<span><span style="color:#666;">${L[loc][1]}</span> ${fmtNumber(assetData.population)}</span>`);
        if (assetData.area) parts.push(`<span><span style="color:#666;">${L[loc][2]}</span> ${fmtArea(assetData.area)}&nbsp;km&sup2;</span>`);
        if (assetData.languages?.[0]) parts.push(`<span><span style="color:#666;">${L[loc][3]}</span> ${escapeHtml(assetData.languages.slice(0,3).join(', '))}</span>`);
        if (parts.length) {
          statsHtml = `<div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:8px;padding:6px 0;border-bottom:1px solid #2a2a4a;font-size:11px;color:#aaa;">${parts.join('')}</div>`;
        }
      }

      polityCard.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
            ${assetData?.flag ? `<img src="${escapeAttr(assetData.flag)}" alt="flag" style="width:64px;height:auto;max-height:40px;object-fit:contain;border-radius:2px;flex-shrink:0;" onerror="this.style.display='none'"/>` : ''}
            ${assetData?.shield ? `<img src="${escapeAttr(assetData.shield)}" alt="" style="width:40px;height:auto;max-height:44px;object-fit:contain;flex-shrink:0;" onerror="this.style.display='none'"/>` : ''}
            <div style="min-width:0;">
              <div style="font-size:15px;font-weight:bold;color:#ffd700;">${escapeHtml(name)}</div>
              ${yearStr ? `<div style="font-size:11px;color:#888;margin-top:2px;">${yearStr}</div>` : ''}
              <div style="font-size:11px;color:#666;margin-top:1px;">${escapeHtml(engName)}</div>
            </div>
          </div>
          <button id="polity-card-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;padding:0 2px;line-height:1;flex-shrink:0;">&times;</button>
        </div>
        ${thumbnail ? `<img src="${thumbnail}" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;margin-bottom:8px;" alt="" />` : ''}
        ${statsHtml}
        <div style="font-size:13px;color:#ccc;line-height:1.65;">${descTruncated}</div>
        ${wiki ? `<div style="margin-top:8px;font-size:11px;"><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki)}" target="_blank" rel="noopener" style="color:#8ab4f8;text-decoration:none;">↗ Wikipedia</a></div>` : ''}
      `;

      const closeBtn = polityCard.querySelector('#polity-card-close');
      if (closeBtn) closeBtn.addEventListener('click', closePolityCard);

      polityCard.style.display = 'block';
    }

    function closePolityCard() {
      polityCard.style.display = 'none';
    }

    function fmtYear(y) {
      if (y == null) return '';
      return y < 0 ? `公元前${Math.abs(y)}年` : `${y}年`;
    }
    function fmtYearEn(y) {
      if (y == null) return '';
      return y < 0 ? `${Math.abs(y)} BC` : `${y} AD`;
    }
    function escapeHtml(s) {
      if (!s) return '';
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }
    function escapeAttr(s) {
      if (!s) return '';
      return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function fmtNumber(n) {
      if (n == null) return '';
      if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(n);
    }
    function fmtArea(a) {
      if (a == null) return '';
      if (a >= 1e6) return (a / 1e6).toFixed(2) + 'M';
      if (a >= 1e4) return (a / 1e3).toFixed(0) + 'K';
      return a.toLocaleString();
    }

    // ── Polity hover + click interaction ──

    /** Currently highlighted polity entity (mouse hover). */
    let highlightedPolity = null;

    function highlightPolity(entity) {
      const mats = polityOriginalMaterials.get(entity);
      if (!mats) return;
      entity.polygon.material = Cesium.Color.fromCssColorString('rgba(255,255,200,0.15)');
      entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#FFD700');
      entity.polygon.outlineWidth = 4.0;
    }

    function unhighlightPolity() {
      if (!highlightedPolity) return;
      const isSatellite = activeBaseId === 'satellite';
      if (isSatellite) {
        highlightedPolity.polygon.material = Cesium.Color.TRANSPARENT;
        highlightedPolity.polygon.outlineColor = Cesium.Color.TRANSPARENT;
        highlightedPolity.polygon.outlineWidth = 0;
      } else {
        const mats = polityOriginalMaterials.get(highlightedPolity);
        if (mats) {
          highlightedPolity.polygon.material = mats.fill;
          highlightedPolity.polygon.outlineColor = mats.stroke;
          highlightedPolity.polygon.outlineWidth = 1.5;
        }
      }
      highlightedPolity = null;
    }

    /** Get the polity Entity from a pick result, or null. */
    function pickedPolity(pick) {
      if (!Cesium.defined(pick)) return null;
      const entity = pick.id;
      if (!entity || !entity.properties) return null;
      const name = entity.properties._polityName;
      return name ? entity : null;
    }

    // Click on polity → show info card (uses ScreenSpaceEventHandler like other plugins)
    try {
      const polClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      polClickHandler.setInputAction((click) => {
        const picked = viewer.scene.pick(click.position);
        if (!Cesium.defined(picked)) {
          closePolityCard();
          return;
        }
        const entity = picked.id;
        if (entity && entity.properties) {
          // Cesium wraps properties in ConstantProperty – check the raw string value
          const nameProp = entity.properties._polityName;
          const name = nameProp?.getValue?.() ?? nameProp;
          if (name) {
            core.state.set('selectedEvent', null);
            showPolityCard(entity);
            return;
          }
        }
        closePolityCard();
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch (err) {
      console.warn('[layers] Could not create click handler:', err.message);
    }

    // Hover highlight: pick on MOUSE_MOVE via rAF so highlight applies before next render.
    let hoverPosition = null;
    let pickPending = false;
    try {
      const polHoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      polHoverHandler.setInputAction((move) => {
        hoverPosition = move.endPosition.clone();
        if (pickPending) return;
        pickPending = true;
        requestAnimationFrame(() => {
          pickPending = false;
          if (!hoverPosition) return;

          const picked = viewer.scene.pick(hoverPosition);
          const entity = Cesium.defined(picked) ? picked.id : null;
          const polity = entity && entity.properties && entity.properties._polityName ? entity : null;

          if (polity && polity !== highlightedPolity) {
            unhighlightPolity();
            highlightedPolity = polity;
            highlightPolity(polity);
          } else if (!polity && highlightedPolity) {
            unhighlightPolity();
          }
        });
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    } catch (err) {
      console.warn('[layers] Could not create hover handler:', err.message);
    }

    // ── Close polity card on year change (entity may change) ──
    core.state.on('currentYear', () => closePolityCard());

    // ── Initial label update ──
    updateAllLabels();

    // ── Startup (wait for name map + descriptions, then sync polities) ──
    (async () => {
      polStatus.textContent = t('loading.status', core.state.get('locale') ?? 'zh');
      await Promise.all([nameMapPromise, descriptionMapPromise, assetsMapPromise]);
      const initialYear = core.state.get('currentYear') ?? 2025;
      await syncPolitiesToYear(initialYear);
      hideFarSideLabels();
      // Auto-load modern borders on satellite basemap
      await loadModernBorders();
    })();

    // ── Far-side culling on camera move ──
    viewer.camera.moveEnd.addEventListener(hideFarSideLabels);

    // ── React to timeline (throttled – polities are expensive to reload) ──
    // Use longer throttle for 2D mode where GeoJSON parsing is heavier
    function getPolityThrottle() { return currentMode === '2d' ? 500 : 150; }
    let polityTimer = null;
    let polityPending = null;
    function onYearChange(year) {
      polityPending = year;
      if (polityTimer) return;
      polityTimer = setTimeout(() => {
        polityTimer = null;
        if (politiesVisible && polityPending != null) syncPolitiesToYear(polityPending);
        polityPending = null;
      }, getPolityThrottle());
    }
    core.state.on('currentYear', onYearChange);
  },
};
