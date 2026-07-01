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
import { throttle } from '../utils.js';

// ═══════════════════════════════════════════
//  Imagery providers  (2 layers only: standard + satellite)
// ═══════════════════════════════════════════
const BASE_LAYERS = [
  {
    id: 'standard',
    label: '标准地图',
    factory: () =>
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: 'CartoDB',
      }),
  },
  {
    id: 'satellite',
    label: '卫星地图',
    factory: () =>
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: 'ESRI World Imagery',
      }),
  },
];

const DEFAULT_BASE_LAYER = 'standard';
const POLITIES_BASE = '/ne/polities/';
const CENTURY_WINDOW = 100;
const MAX_POLITIES = 100; // safety cap – prevents Cesium entity overflow

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
    baseTitle.textContent = '🗺 底图';
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
      updateBtnStyles();
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

    // Settings / Language
    const settingsTitle = document.createElement('div');
    settingsTitle.textContent = '⚙ 设置';
    settingsTitle.style.cssText = 'color:#ffd700;font-weight:bold;margin-bottom:4px;margin-top:4px;';
    panel.appendChild(settingsTitle);

    const localeBtn = document.createElement('button');
    function updateLocaleBtn(locale) {
      const active = locale === 'zh';
      localeBtn.textContent = active ? '✓ 中文' : '中文';
      localeBtn.style.background = active ? '#4a60af' : '#2a2a4a';
      localeBtn.style.borderColor = active ? '#6a80cf' : '#4a4a7a';
    }
    Object.assign(localeBtn.style, {
      border: '1px solid',
      color: '#ccc',
      padding: '4px 8px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      textAlign: 'left',
      marginBottom: '12px',
    });
    updateLocaleBtn(core.state.get('locale') ?? 'zh');
    localeBtn.addEventListener('click', () => {
      const cur = core.state.get('locale') ?? 'zh';
      core.state.set('locale', cur === 'zh' ? 'en' : 'zh');
    });
    panel.appendChild(localeBtn);

    core.state.on('locale', (val) => {
      updateLocaleBtn(val);
      updateModernLabels();
    });

    // Historical Polities Section
    const polTitle = document.createElement('div');
    polTitle.textContent = '🌐 历史政区';
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
    let modernVisible = false;
    let syncGeneration = 0; // race-condition guard

    /** @type {Map<string, Array>} century → raw GeoJSON features */
    const centuryCache = new Map();

    /** @type {Set<import('cesium').Entity>|null} */
    let politiesEntities = null;
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
      polStatus.textContent = `${year} · 加载中...`;

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

      // Remove previous entities
      if (politiesEntities) {
        for (const ent of politiesEntities) viewer.entities.remove(ent);
        politiesEntities = null;
      }

      if (activeFeatures.length === 0) {
        polStatus.textContent = `${year} · 无数据`;
        return;
      }

      // Cap to prevent Cesium "Too many properties" errors
      let shown = activeFeatures;
      if (activeFeatures.length > MAX_POLITIES) {
        shown = activeFeatures
          .sort((a, b) => (b.properties?.Area || 0) - (a.properties?.Area || 0))
          .slice(0, MAX_POLITIES);
      }

      try {
        // Create entities manually from raw GeoJSON features
        const newEntities = new Set();

        for (const feature of shown) {
          const name = feature.properties?.Name || '';
          if (!name) continue;

          const color = polityFillColor(name);
          const stroke = polityStrokeColor(name);
          const shortName = name.split(/[,（(]/)[0].trim();
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
                font: 'bold 13px "Microsoft YaHei", "Noto Sans SC", sans-serif',
                fillColor: Cesium.Color.fromCssColorString('#f0e8d8'),
                outlineColor: Cesium.Color.fromCssColorString('#0a0a1a'),
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                scaleByDistance: new Cesium.NearFarScalar(0.5e6, 1.2, 4e6, 0.0),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                pixelOffset: new Cesium.Cartesian2(0, -6),
              },
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

        // Store references for cleanup on next sync
        politiesEntities = newEntities;

        const suffix = activeFeatures.length > MAX_POLITIES
          ? ` (显示前${MAX_POLITIES})`
          : '';
        polStatus.textContent = `${year} · ${newEntities.size} 个政区${suffix}`;
      } catch (err) {
        console.error('[layers] Failed to create polities:', err);
        polStatus.textContent = `${year} · 加载失败`;
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

    // ── Modern borders (fallback) ──
    async function loadModernBorders() {
      if (modernCountriesDS) return;
      try {
        modernCountriesDS = await Cesium.GeoJsonDataSource.load(
          '/ne/ne_110m_admin_0_countries.json',
          {
            stroke: Cesium.Color.fromCssColorString('#e74c3c'),
            strokeWidth: 1.5,
            fill: Cesium.Color.fromCssColorString('#e74c3c').withAlpha(0.04),
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
              scaleByDistance: new Cesium.NearFarScalar(0.8e6, 1.2, 5e6, 0.25),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              pixelOffset: new Cesium.Cartesian2(0, -4),
            };
          }
        }
        await viewer.dataSources.add(modernCountriesDS);

        modernLinesDS = await Cesium.GeoJsonDataSource.load(
          '/ne/ne_50m_admin_0_boundary_lines_land.json',
          {
            stroke: Cesium.Color.fromCssColorString('#e74c3c'),
            strokeWidth: 1.5,
          },
        );
        await viewer.dataSources.add(modernLinesDS);

        modernCountriesDS.show = modernVisible;
        modernLinesDS.show = modernVisible;
      } catch (err) {
        console.error('[layers] Failed to load modern borders:', err);
      }
    }

    // ── Toggle: Historical Polities ──
    const polToggle = document.createElement('button');
    polToggle.textContent = '✓ 历史政区';
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
      if (politiesVisible) {
        polToggle.textContent = '✓ 历史政区';
        polToggle.style.background = '#2c6e49';
        polToggle.style.borderColor = '#40916c';
        const year = core.state.get('currentYear') ?? 2025;
        await syncPolitiesToYear(year);
      } else {
        polToggle.textContent = '历史政区';
        polToggle.style.background = '#2a2a4a';
        polToggle.style.borderColor = '#4a4a7a';
        if (politiesEntities) {
          for (const ent of politiesEntities) viewer.entities.remove(ent);
          politiesEntities = null;
        }
        polStatus.textContent = '已隐藏';
      }
    });
    polBtns.appendChild(polToggle);

    // ── Toggle: Modern Borders ──
    const modernToggle = document.createElement('button');
    modernToggle.textContent = '现代边界';
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
      if (modernVisible) {
        modernToggle.textContent = '✓ 现代边界';
        modernToggle.style.background = '#2c6e49';
        modernToggle.style.borderColor = '#40916c';
        await loadModernBorders();
      } else {
        modernToggle.textContent = '现代边界';
        modernToggle.style.background = '#2a2a4a';
        modernToggle.style.borderColor = '#4a4a7a';
      }
      if (modernCountriesDS) modernCountriesDS.show = modernVisible;
      if (modernLinesDS) modernLinesDS.show = modernVisible;
    });
    polBtns.appendChild(modernToggle);

    // ── Startup ──
    (async () => {
      polStatus.textContent = '加载中...';
      const initialYear = core.state.get('currentYear') ?? 2025;
      await syncPolitiesToYear(initialYear);
    })();

    // ── React to timeline (throttled – polities are expensive to reload) ──
    const onYearChange = throttle((year) => {
      if (politiesVisible) syncPolitiesToYear(year);
    }, 150);
    core.state.on('currentYear', onYearChange);
  },
};
