/**
 * MapLibre GL JS 2D map renderer.
 *
 * Provides polity boundaries + event markers in a Mercator-projection flat map
 * that looks and behaves like Google Maps / OpenStreetMap.
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CATEGORIES } from '../config.js';
import { getDisplayCategory, simplifyCoords } from '../utils.js';
const GOLDEN_ANGLE = 0.618033988749895;
const _colorCache = new Map();
const _strokeCache = new Map();
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h = h & h; }
  return Math.abs(h);
}
function polityCSSColor(name) {
  const n = name || 'unknown';
  let c = _colorCache.get(n);
  if (c) return c;
  const hash = hashStr(n);
  const hue = ((hash * GOLDEN_ANGLE) % 1) * 360;
  c = `hsl(${hue}, ${50 + (hash % 3) * 4}%, ${55 + (hash % 2) * 6}%)`;
  _colorCache.set(n, c);
  return c;
}
function polityStrokeCSS(name) {
  const n = name || 'unknown';
  let c = _strokeCache.get(n);
  if (c) return c;
  const hash = hashStr(n);
  const hue = ((hash * GOLDEN_ANGLE) % 1) * 360;
  c = `hsl(${hue}, 60%, 40%)`;
  _strokeCache.set(n, c);
  return c;
}

/** Dark basemap style matching the overall dark UI theme */
const BASE_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
    },
  },
  layers: [{ id: 'carto-bg', type: 'raster', source: 'carto' }],
};

const POLITY_SOURCE = 'polities-2d';
const EVENT_SOURCE = 'events-2d';

export function createMap2DRenderer(core) {
  let map = null;
  let ready = false;
  let destroyed = false;
  let pendingPolities = null;
  let pendingEvents = null;
  // Viewport state for mode switching
  let savedCenter = null;
  let savedZoom = null;

  /* ---- lifecycle ---- */

  function init(centerLon, centerLat, zoomLevel) {
    destroyed = false; // Reset destroyed flag — allows re-init after destroy
    if (map) return;
    const container = document.getElementById('map-2d-container');
    if (!container) return;

    // Restore saved viewport if available
    const useCenter = savedCenter ?? [centerLon, centerLat];
    const useZoom = savedZoom ?? zoomLevel;

    map = new maplibregl.Map({
      container,
      style: BASE_STYLE,
      center: useCenter,
      zoom: useZoom,
      attributionControl: true,
      maxBounds: [[-180, -85], [180, 85]],
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', () => {
      if (destroyed) { ready = false; map?.remove(); map = null; return; }
      ready = true;

      // ── Polity layers ──
      map.addSource(POLITY_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'polities-fill',
        type: 'fill',
        source: POLITY_SOURCE,
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.40 },
      });
      map.addLayer({
        id: 'polities-outline',
        type: 'line',
        source: POLITY_SOURCE,
        paint: { 'line-color': ['get', 'stroke'], 'line-width': 1.2 },
      });
      map.addLayer({
        id: 'polities-label',
        type: 'symbol',
        source: POLITY_SOURCE,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Open Sans Regular', 'Noto Sans SC Regular'],
          'text-offset': [0, -1.2],
          'text-anchor': 'bottom',
        },
        paint: {
          'text-color': '#f0e8d8',
          'text-halo-color': '#0a0a1a',
          'text-halo-width': 2,
        },
      });

      // ── Event layers with clustering ──
      map.addSource(EVENT_SOURCE, {
        type: 'geojson',
        data: emptyFC(),
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 50,
      });

      // Cluster circles
      map.addLayer({
        id: 'events-cluster',
        type: 'circle',
        source: EVENT_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'],
            '#6a80cf', 10, '#4a60af', 50, '#c0392b'],
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });

      // Cluster count labels
      map.addLayer({
        id: 'events-cluster-count',
        type: 'symbol',
        source: EVENT_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 13,
          'text-font': ['Open Sans Bold'],
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#0a0a1a',
          'text-halo-width': 2,
        },
      });

      // Individual event circles (unclustered only)
      map.addLayer({
        id: 'events-circle',
        type: 'circle',
        source: EVENT_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 4,    // zoom 3 → radius 4
            8, 7,    // zoom 8 → radius 7
          ],
          'circle-color': ['get', 'markerColor'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });

      // Event labels — only visible at higher zoom levels
      map.addLayer({
        id: 'events-label',
        type: 'symbol',
        source: EVENT_SOURCE,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'title'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            5, 0,    // invisible at zoom ≤5
            8, 12,   // full size at zoom ≥8
          ],
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-max-width': 12,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#0a0a1a',
          'text-halo-width': 2,
        },
      });

      // Click → cluster expands or select event
      map.on('click', 'events-cluster', (e) => {
        if (!e.features?.[0]) return;
        const clusterId = e.features[0].properties.cluster_id;
        const source = map.getSource(EVENT_SOURCE);
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const geom = e.features[0].geometry;
          map.flyTo({ center: [geom.coordinates[0], geom.coordinates[1]], zoom: zoom + 1, duration: 400 });
        });
      });

      // Click on polity → show popup card
      let activePopup = null;
      map.on('click', 'polities-fill', (e) => {
        if (!e.features?.[0]) return;
        const props = e.features[0].properties;
        const name = props._name || props.label || '';
        const wiki = props._wiki || '';
        const from = props._from;
        const to = props._to;

        const descriptions = core._polityDescriptions;
        let zhDesc = '', enDesc = '';
        if (descriptions && wiki) {
          const entry = descriptions[wiki] || null;
          if (entry?.zh) zhDesc = entry.zh.extract || '';
          if (entry?.en && !zhDesc) enDesc = entry.en.extract || '';
        }

        // Look up assets
        const assets = core._polityAssets;
        const assetData = assets ? (assets[wiki] || null) : null;

        const locale = core.state.get('locale') ?? 'zh';
        const yearStr = from != null && to != null
          ? (locale === 'zh' ? `${fmtYear(from)} — ${fmtYear(to)}` : `${fmtYearEn(from)} — ${fmtYearEn(to)}`)
          : '';
        const desc = zhDesc || enDesc || (locale === 'zh' ? '暂无介绍' : 'No description available');
        const descTruncated = desc.length > 800 ? desc.slice(0, 800) + '……' : desc;

        const loc = locale === 'zh' ? 1 : 0;
        const L = [
          ['Capital:', 'Pop:', 'Area:', 'Lang:'],
          ['首都：', '人口：', '面积：', '语言：'],
        ];
        let statsHtml = '';
        if (assetData) {
          const parts = [];
          if (assetData.capital) parts.push(`<span><span style="color:#666;">${L[loc][0]}</span> ${escHtml(String(assetData.capital))}</span>`);
          if (assetData.population) parts.push(`<span><span style="color:#666;">${L[loc][1]}</span> ${fmtNum(assetData.population)}</span>`);
          if (assetData.area) parts.push(`<span><span style="color:#666;">${L[loc][2]}</span> ${fmtAr(assetData.area)}&nbsp;km&sup2;</span>`);
          if (assetData.languages?.[0]) parts.push(`<span><span style="color:#666;">${L[loc][3]}</span> ${escHtml(assetData.languages.slice(0,3).join(', '))}</span>`);
          if (parts.length) {
            statsHtml = `<div style="display:flex;flex-wrap:wrap;gap:4px 10px;margin-bottom:6px;padding:4px 0;border-bottom:1px solid #2a2a4a;font-size:10px;color:#aaa;">${parts.join('')}</div>`;
          }
        }

        const popupHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            ${assetData?.flag ? `<img src="${escAttr(assetData.flag)}" alt="flag" style="width:48px;height:auto;max-height:30px;object-fit:contain;border-radius:2px;flex-shrink:0;" onerror="this.style.display='none'"/>` : ''}
            <div>
              <div style="font-size:14px;font-weight:bold;color:#ffd700;">${escapeHtml(name)}</div>
              ${yearStr ? `<div style="font-size:11px;color:#888;margin-top:1px;">${yearStr}</div>` : ''}
            </div>
          </div>
          ${statsHtml}
          <div style="font-size:13px;color:#ccc;line-height:1.65;margin-top:6px;">${descTruncated}</div>
          ${wiki ? `<div style="margin-top:8px;font-size:11px;"><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki)}" target="_blank" rel="noopener" style="color:#8ab4f8;text-decoration:none;">↗ Wikipedia</a></div>` : ''}
        `;

        if (activePopup) activePopup.remove();
        activePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '360px' })
          .setLngLat(e.lngLat)
          .setHTML(popupHTML)
          .addTo(map);
      });

      // Clear popup on year change
      core.state.on('currentYear', () => {
        if (activePopup) { activePopup.remove(); activePopup = null; }
      });

      map.on('mouseenter', 'polities-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'polities-fill', () => { map.getCanvas().style.cursor = ''; });

      map.on('mouseenter', 'events-cluster', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'events-cluster', () => { map.getCanvas().style.cursor = ''; });

      map.on('click', 'events-circle', (e) => {
        if (!e.features?.[0]) return;
        const props = e.features[0].properties;
        const evt = props?.__eventData;
        if (evt) {
          core.state.set('selectedEvent', JSON.parse(evt));
          // Fly to the event location
          const geom = e.features[0].geometry;
          map.flyTo({ center: [geom.coordinates[0], geom.coordinates[1]], zoom: 8, duration: 600 });
        }
      });

      map.on('mouseenter', 'events-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'events-circle', () => { map.getCanvas().style.cursor = ''; });

      // Track viewport changes for state preservation
      map.on('moveend', () => {
        if (!map || destroyed) return;
        savedCenter = map.getCenter();
        savedZoom = map.getZoom();
      });

      // Flush pending data
      if (pendingPolities) { setPolities(pendingPolities); pendingPolities = null; }
      if (pendingEvents) { setEvents(pendingEvents); pendingEvents = null; }
    });
  }

  function destroy() {
    if (map && !destroyed) {
      // Save viewport before destroying
      savedCenter = map.getCenter();
      savedZoom = map.getZoom();
    }
    destroyed = true;
    if (map) { map.remove(); map = null; ready = false; }
  }

  /* ---- polity boundaries ---- */

  /** Max vertices per polygon ring for 2D rendering */
  const MAX_RING_VERTICES = 250;

  function setPolities(features) {
    if (!ready) { pendingPolities = features; return; }
    try {
      const locale = core.state.get('locale') ?? 'zh';
      const nameMap = core._polityNameMap;
      const fc = { type: 'FeatureCollection', features: features.map(f => {
        const name = f.properties?.Name || '';
        const displayName = locale === 'zh' && nameMap
          ? (nameMap[name] || nameMap[name.replace(/^\(|\)$/g, '')] || name)
          : name;
        const shortName = displayName.split(/[,（(]/)[0].trim();
        const coords = f._simplified
          ? f.geometry.coordinates
          : simplifyCoords(f.geometry.coordinates, MAX_RING_VERTICES);
        const fill = f._fill ?? polityCSSColor(name);
        const stroke = f._stroke ?? polityStrokeCSS(name);
        return {
          type: 'Feature',
          geometry: { type: f.geometry.type, coordinates: coords },
          properties: {
            label: shortName,
            fill,
            stroke,
            _name: displayName,
            _wiki: f.properties?.Wikipedia,
            _from: f.properties?.FromYear,
            _to: f.properties?.ToYear,
          },
        };
      })};
      map.getSource(POLITY_SOURCE)?.setData(fc);
    } catch (e) {
      console.warn('[map2d] setPolities error:', e);
    }
  }

  function clearPolities() {
    try { map?.getSource(POLITY_SOURCE)?.setData(emptyFC()); } catch {}
  }

  /* ---- event markers with clustering ---- */

  // Max events to avoid GeoJSON performance issues
  const MAX_EVENTS_2D = 2000;

  function setEvents(events) {
    if (!ready) { pendingEvents = events; return; }
    try {
      // Cap the number of events to prevent GeoJSON performance degradation
      let filtered = events
        .filter(e => e.coordinates_approx)
        .map(e => {
          const [lat, lon] = parseCoords(e.coordinates_approx);
          if (lat === 0 && lon === 0) return null;
          const cfg = CATEGORIES[getDisplayCategory(e.category)] || { color: '#888' };
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: {
              title: e.title || '',
              markerColor: cfg.color,
              __eventData: JSON.stringify(e),
            },
          };
        })
        .filter(Boolean);

      // If too many events, sample them to keep map responsive
      if (filtered.length > MAX_EVENTS_2D) {
        // Prioritize important categories — sample proportionally
        const sampled = [];
        const step = filtered.length / MAX_EVENTS_2D;
        for (let i = 0; i < filtered.length; i += step) {
          sampled.push(filtered[Math.floor(i)]);
        }
        filtered = sampled;
      }

      const fc = { type: 'FeatureCollection', features: filtered };
      map?.getSource(EVENT_SOURCE)?.setData(fc);
    } catch (e) {
      console.warn('[map2d] setEvents error:', e);
    }
  }

  function clearEvents() {
    try { map?.getSource(EVENT_SOURCE)?.setData(emptyFC()); } catch {}
  }

  /** Fly / pan to a location */
  function flyTo(lon, lat, zoom) {
    if (!map) return;
    map.flyTo({ center: [lon, lat], zoom: zoom ?? map.getZoom() ?? 5, duration: 800 });
  }

  /** Get current view state (for mode switching preservation) */
  function getViewState() {
    if (!map || destroyed) return null;
    return { center: map.getCenter(), zoom: map.getZoom() };
  }

  return { init, destroy, setPolities, clearPolities, setEvents, clearEvents, flyTo, getViewState };
}

function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

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
// Short aliases for use inside closure (where escapeHtml is already defined)
const escHtml = escapeHtml;
function escAttr(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtNum(n) {
  if (n == null) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function fmtAr(a) {
  if (a == null) return '';
  if (a >= 1e6) return (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (a / 1e3).toFixed(0) + 'K';
  return a.toLocaleString();
}

/** Minimal coord parser (same logic as utils.js) */
function parseCoords(s) {
  if (!s || typeof s !== 'string') return [0, 0];
  let c = s.replace(/\([^)]*\)/g, '').trim();
  const si = c.indexOf(';');
  if (si > -1) c = c.substring(0, si).trim();
  const p = c.split(',').map(v => v.trim());
  if (p.length < 2) return [0, 0];
  function pc(r, pos, neg) {
    const n = parseFloat(r);
    if (isNaN(n)) return 0;
    const u = r.toUpperCase();
    if (u.includes(neg)) return -Math.abs(n);
    if (u.includes(pos)) return Math.abs(n);
    return n;
  }
  return [pc(p[0], 'N', 'S'), pc(p[1], 'E', 'W')];
}

