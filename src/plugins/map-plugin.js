/**
 * Map plugin – manages Cesium billboard entities for historical events.
 *
 * Phase 3 optimisations:
 *  - Only creates entities for events in the current year window + active filters.
 *  - Destroys entities when they fall out of scope (not just hiding them).
 *  - Uses DistanceDisplayCondition so far-away markers are invisible.
 *  - Batch-adds entities when data:loaded fires.
 */

import * as Cesium from 'cesium';
import { CATEGORIES } from '../config.js';
import { parseCoords, getDisplayCategory, isEventVisible } from '../utils.js';

// ── Marker canvas cache ──
const markerCache = new Map();

function getMarkerImage(category) {
  if (markerCache.has(category)) return markerCache.get(category);
  const cfg = CATEGORIES[category];
  const color = cfg?.color ?? '#888';
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size * 0.38;

  // Glow
  const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, size * 0.65);
  glow.addColorStop(0, color);
  glow.addColorStop(0.5, color + '44');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.65, 0, Math.PI * 2);
  ctx.fill();

  // Pin body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, size - 2);
  ctx.quadraticCurveTo(cx - 10, cy + 6, cx - 8, cy - 1);
  ctx.quadraticCurveTo(cx - 9, cy - 8, cx, cy - 8);
  ctx.quadraticCurveTo(cx + 9, cy - 8, cx + 8, cy - 1);
  ctx.quadraticCurveTo(cx + 10, cy + 6, cx, size - 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(cx - 2, cy - 2, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const uri = canvas.toDataURL();
  markerCache.set(category, uri);
  return uri;
}

// ── Plugin ──
export default {
  name: 'map-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const viewer = core.viewer;

    /** Currently active entities, keyed by event.id */
    const entityMap = new Map();

    /**
     * Replace all displayed entities with a new event batch.
     * Only events whose category is in `activeFilters` get an entity.
     */
    function rebuildEntities(events, activeFilters) {
      // Remove old
      for (const [, ent] of entityMap) viewer.entities.remove(ent);
      entityMap.clear();

      for (const evt of events) {
        if (!isEventVisible(evt.category, activeFilters)) continue;

        const [lat, lon] = parseCoords(evt.coordinates_approx);
        const displayCat = getDisplayCategory(evt.category);
        const markerImg = getMarkerImage(displayCat);

        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          billboard: {
            image: markerImg,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.4, 8.0e6, 0.45),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            // Phase 3: hide markers entirely when zoomed very far out
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,          // visible when closer than...
              16.0e6,     // 16000 km
            ),
          },
          label: {
            text: (evt.title || '').length > 25 ? evt.title.slice(0, 24) + '…' : evt.title,
            font: 'bold 13px "Microsoft YaHei", "Segoe UI", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#000000'),
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.2, 6.0e6, 0.0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 16.0e6),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#0a0a1a').withAlpha(0.7),
            backgroundPadding: new Cesium.Cartesian2(6, 4),
          },
          properties: { eventData: evt },
        });

        entityMap.set(evt.id, entity);
      }
    }

    /** Sync events to the 2D map renderer (if active). */
    function refresh2D(events, filters) {
      const map2d = core.state.get('_map2d');
      if (!map2d) return;
      const year = core.state.get('currentYear');
      const yearEvents = events.filter((e) => e._year === year && isEventVisible(e.category, filters));
      map2d.setEvents(yearEvents);
      core.events.emit('markers:count', { visible: yearEvents.length, total: yearEvents.length });
    }

    // ── Click / hover on Cesium canvas ──
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (!Cesium.defined(picked)) return;

      const entity = picked.id;
      if (!entity) return;

      // Cesium may wrap properties in ConstantProperty – handle both
      const raw = entity.properties?.eventData;
      const evt = raw?.getValue ? raw.getValue() : raw;

      if (evt) {
        core.state.set('selectedEvent', evt);
        viewer.flyTo(entity, {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-75), 500000),
          duration: 1.0,
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((move) => {
      const picked = viewer.scene.pick(move.endPosition);
      viewer.canvas.style.cursor =
        Cesium.defined(picked) && picked.id?.properties?.eventData ? 'pointer' : 'default';
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // ── React to data, year & filter changes ──
    function refresh() {
      const events = core.state.get('dataEvents') ?? [];
      const year = core.state.get('currentYear');
      const filters = core.state.get('activeFilters') ?? new Set();
      const yearEvents = events.filter((e) => e._year === year);
      const mode = core.state.get('mapMode') ?? '3d';

      if (mode === '2d') {
        // Clear Cesium entities, delegate to MapLibre
        for (const [, ent] of entityMap) viewer.entities.remove(ent);
        entityMap.clear();
        refresh2D(yearEvents, filters);
      } else {
        // Clear 2D markers, render with Cesium
        const map2d = core.state.get('_map2d');
        if (map2d) map2d.clearEvents();
        rebuildEntities(yearEvents, filters);
        const visible = entityMap.size;
        core.events.emit('markers:count', { visible, total: yearEvents.length });
      }
    }

    // Also refresh when mode changes
    core.state.on('mapMode', refresh);
    core.events.on('data:loaded', refresh);
    core.state.on('activeFilters', refresh);
    core.state.on('currentYear', refresh);
  },
};
