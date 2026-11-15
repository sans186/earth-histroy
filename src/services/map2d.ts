import type { Feature, FeatureCollection } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import { BASEMAPS, INITIAL_VIEW, type BaseKind } from '@/config';
import { labelAnchor } from '@/lib/polityScope';
import type { HoverInfo, WarMarker } from '@/services/globe';
import type { Locale, PolityFeature, TimelineEvent } from '@/types';

/**
 * Flat map, same layers as the globe.
 *
 * Deliberately a separate renderer rather than a projection flag on the 3D
 * scene: Cesium's 2D mode still builds the whole ellipsoid, and the point of
 * this view is a cheap, print-like map that pans instantly. The two share the
 * stores and the data services, not the engine.
 */

export interface Map2DCallbacks {
  onPickEvent?: (event: TimelineEvent | null) => void;
  onHoverEvent?: (info: HoverInfo | null) => void;
  onPickPolity?: (feature: PolityFeature) => void;
  onPickWar?: (warId: string) => void;
  onViewChange?: () => void;
}

function css(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Lightens a `#rrggbb` colour, for cues that must survive on dark imagery. */
function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * War theatres are solid ink diamonds with a pale rim, exactly like the Cesium
 * billboards, so a war never reads as just another round event dot.
 */
function diamondImage(fill: string, stroke: string, size: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  const inset = size / 8;
  const c = size / 2;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(c, inset);
    ctx.lineTo(size - inset, c);
    ctx.lineTo(c, size - inset);
    ctx.lineTo(inset, c);
    ctx.closePath();
  };

  outline();
  ctx.fillStyle = fill;
  ctx.fill();
  outline();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = size / 12;
  ctx.lineJoin = 'round';
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function baseStyle(kind: BaseKind): maplibregl.StyleSpecification {
  const satellite = kind === 'satellite';
  const base = BASEMAPS[kind];
  const layers: maplibregl.LayerSpecification[] = [
    {
      id: 'base',
      type: 'raster',
      source: 'base',
      paint: {
        // The topo basemap is pushed towards the paper palette so polity fills
        // stay readable on it; satellite keeps its own colour.
        'raster-saturation': satellite ? -0.1 : -0.62,
        'raster-contrast': satellite ? 0.04 : -0.12,
        'raster-brightness-max': satellite ? 1 : 0.99,
      },
    },
  ];
  if (!satellite) {
    layers.push({
      id: 'paper-wash',
      type: 'background',
      paint: {
        'background-color': css('--paper', '#f7f5f0'),
        'background-opacity': 0.16,
      },
    });
  }
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [base.url],
        tileSize: 256,
        maxzoom: base.maxzoom,
        attribution: base.attribution,
      },
    },
    layers,
  };
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export class Map2D {
  private map: maplibregl.Map | null = null;
  private callbacks: Map2DCallbacks = {};
  private base: BaseKind = 'standard';
  private ready = false;
  private pendingEvents: TimelineEvent[] = [];
  private pendingPolities: PolityFeature[] = [];
  /** Stops of the open person's route, kept so a style swap can redraw them. */
  private pendingTrajectory: Array<{ lon: number; lat: number }> = [];
  /**
   * Lookup tables, so a rendered feature only carries a short key instead of a
   * whole record. MapLibre serialises every property value, and pushing full
   * event objects through the tile pipeline doubles the work for no gain.
   */
  private eventIndex = new Map<string, TimelineEvent>();
  private polityIndex = new Map<string, PolityFeature>();
  private resizeObserver: ResizeObserver | null = null;

  /** Feature id of the polity under the cursor, for `feature-state` highlight. */
  private hoveredPolityId: number | null = null;

  /* Reference layers, cached so a basemap switch can rebuild them without a
   * second network round trip. */
  private borderCountries: FeatureCollection | null = null;
  private borderLines: FeatureCollection | null = null;
  private bordersVisible = false;
  private warFeatures: Feature[] = [];

  /*
   * Polity names.
   *
   * Not a MapLibre symbol layer: text there needs a glyph server, and the CJK
   * font packs are tens of megabytes that this app has no way to host. Plain
   * positioned divs over the canvas render any script with the system font, need
   * no network, and let the collision rule below stay in ordinary TypeScript.
   */
  private labelHost: HTMLDivElement | null = null;
  private labelPool: HTMLDivElement[] = [];
  private labelItems: { text: string; lon: number; lat: number; weight: number }[] = [];
  private labelsOn = true;
  private labelLocale: Locale = 'zh';
  private labelFrame = 0;

  init(container: HTMLElement, callbacks: Map2DCallbacks) {
    this.destroy();
    this.callbacks = callbacks;

    const map = new maplibregl.Map({
      container,
      style: baseStyle(this.base),
      center: [INITIAL_VIEW.lon, INITIAL_VIEW.lat],
      zoom: 2,
      minZoom: 1,
      maxZoom: 12,
      attributionControl: false,
      // The globe owns the left-button drag; matching it here keeps the two
      // views feeling like the same instrument.
      dragRotate: false,
      pitchWithRotate: false,
    });
    this.map = map;

    // The stage sits in a grid that settles after mount, so the canvas can be
    // created at zero size and stay blank until something forces a resize.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    this.resizeObserver = observer;

    // Names live in screen space, so they have to follow every pan and zoom.
    map.on('move', () => this.queueLabels());
    map.on('resize', () => this.queueLabels());

    map.on('load', () => {
      this.ready = true;
      this.addLayers();
      this.applyStyle();
      this.renderEvents(this.pendingEvents, { labels: true });
      this.renderPolities(this.pendingPolities, {});
      this.renderTrajectory(this.pendingTrajectory);
      this.repaintWars();
      callbacks.onViewChange?.();
    });

    map.on('moveend', () => callbacks.onViewChange?.());
    map.on('click', (e) => this.handleClick(e));
    map.on('mousemove', (e) => this.handleHover(e));
    map.on('mouseout', () => {
      this.setPolityHover(null);
      callbacks.onHoverEvent?.(null);
    });
  }

  private addLayers() {
    const map = this.map;
    if (!map) return;

    /*
     * Modern reference borders go under the historical polities: on a flat map
     * they are context, not content. Two sources because Natural Earth splits
     * them that way — country polygons (coastlines plus land borders) and the
     * detailed boundary lines that carry the disputed stretches.
     */
    map.addSource('borders-countries', {
      type: 'geojson',
      data: this.borderCountries ?? EMPTY,
    });
    map.addSource('borders-lines', {
      type: 'geojson',
      data: this.borderLines ?? EMPTY,
    });
    const borderLayout = {
      visibility: (this.bordersVisible ? 'visible' : 'none') as 'visible' | 'none',
    };
    // `--ink-2` at 1 px was invisible against the toned-down basemap in 3D too;
    // the flat map has the same problem, so width scales with zoom instead.
    const borderPaint: maplibregl.LineLayerSpecification['paint'] = {
      'line-color': css('--ink-2', '#4c4f56'),
      'line-opacity': 0.62,
      'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.9, 6, 1.5],
    };
    map.addLayer({
      id: 'borders-countries',
      type: 'line',
      source: 'borders-countries',
      layout: borderLayout,
      paint: borderPaint,
    });
    map.addLayer({
      id: 'borders-lines',
      type: 'line',
      source: 'borders-lines',
      layout: borderLayout,
      paint: borderPaint,
    });

    map.addSource('polities', { type: 'geojson', data: EMPTY });
    // Boundary first so the wash never hides the outline.
    map.addLayer({
      id: 'polities-line',
      type: 'line',
      source: 'polities',
      paint: { 'line-color': ['get', 'stroke'], 'line-width': 1.1 },
    });
    map.addLayer({
      id: 'polities-fill',
      type: 'fill',
      source: 'polities',
      paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.42 },
    });

    map.addSource('events', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'events',
      type: 'circle',
      source: 'events',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 5, 5.5, 9, 7],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': css('--paper', '#f7f5f0'),
        'circle-stroke-width': 1.4,
        'circle-opacity': 0.95,
      },
    });

    /*
     * One person's life path, above the events so the route is never buried.
     * Line and nodes share a source and are separated by geometry type.
     */
    map.addSource('person-route', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'person-route-line',
      type: 'line',
      source: 'person-route',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': css('--rust', '#b0522d'),
        'line-width': 2,
        'line-dasharray': [2, 1.5],
        'line-opacity': 0.85,
      },
    });
    map.addLayer({
      id: 'person-route-node',
      type: 'circle',
      source: 'person-route',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 4.5,
        'circle-color': css('--rust', '#b0522d'),
        'circle-stroke-color': css('--paper', '#f7f5f0'),
        'circle-stroke-width': 1.6,
      },
    });

    // War markers. Images are re-added here because `setStyle` drops them along
    // with every non-base source.
    if (!map.hasImage('war-idle')) {
      map.addImage(
        'war-idle',
        diamondImage(css('--ink', '#1a1c20'), css('--paper', '#f7f5f0'), 64),
        { pixelRatio: 2 },
      );
    }
    if (!map.hasImage('war-active')) {
      map.addImage(
        'war-active',
        diamondImage(css('--rust', '#b0522d'), css('--paper', '#f7f5f0'), 64),
        { pixelRatio: 2 },
      );
    }
    map.addSource('wars', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: this.warFeatures },
    });
    map.addLayer({
      id: 'wars',
      type: 'symbol',
      source: 'wars',
      layout: {
        'icon-image': ['case', ['boolean', ['get', 'active'], false], 'war-active', 'war-idle'],
        'icon-size': ['case', ['boolean', ['get', 'active'], false], 0.9, 0.58],
        // A few hundred theatres overlap at world zoom; hiding them behind each
        // other's collision boxes would make most of them unreachable.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
  }

  /** Basemap and polity paint, which both depend on standard vs satellite. */
  private applyStyle() {
    const map = this.map;
    if (!map || !this.ready) return;
    const satellite = this.base === 'satellite';

    // Hover cues ride on `feature-state`, so one expression covers both states
    // and the outline/fill never drift apart.
    map.setPaintProperty('polities-fill', 'fill-opacity', [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      satellite ? 0.14 : 0.78,
      // Satellite is boundary-only, but a fully transparent fill cannot be
      // picked, so it keeps a hint of wash.
      satellite ? 0.01 : 0.42,
    ]);
    map.setPaintProperty('polities-line', 'line-color', [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      satellite ? lighten(css('--rust', '#b0522d'), 0.5) : css('--rust', '#b0522d'),
      satellite ? css('--rust', '#b0522d') : ['get', 'stroke'],
    ]);
    map.setPaintProperty('polities-line', 'line-width', [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      satellite ? 2.8 : 2.2,
      satellite ? 1.4 : 1.1,
    ]);
    map.setPaintProperty('events', 'circle-stroke-color', css('--paper', '#f7f5f0'));
  }

  private setPolityHover(id: number | null) {
    const map = this.map;
    if (!map || !this.ready || this.hoveredPolityId === id) return;
    if (this.hoveredPolityId !== null) {
      map.setFeatureState({ source: 'polities', id: this.hoveredPolityId }, { hover: false });
    }
    this.hoveredPolityId = id;
    if (id !== null) map.setFeatureState({ source: 'polities', id }, { hover: true });
  }

  setBase(kind: BaseKind) {
    this.base = kind;
    const map = this.map;
    if (!map) return;
    // setStyle drops every non-base source and image, so the overlay has to be
    // rebuilt. The listener is registered first: setStyle can emit `styledata`
    // before it returns, and `once` after the fact would wait for a second event
    // that never comes.
    this.ready = false;
    this.hoveredPolityId = null;
    map.once('styledata', () => {
      if (this.map !== map) return;
      this.ready = true;
      this.addLayers();
      this.applyStyle();
      this.renderEvents(this.pendingEvents, { labels: true });
      this.renderPolities(this.pendingPolities, {});
      this.renderTrajectory(this.pendingTrajectory);
    });
    map.setStyle(baseStyle(kind));
  }

  renderEvents(events: TimelineEvent[], _opts: { labels: boolean }) {
    this.pendingEvents = events;
    this.eventIndex.clear();
    const map = this.map;
    if (!map || !this.ready) return;
    const features: GeoJSON.Feature[] = [];
    for (const ev of events) {
      if (ev.lon === null || ev.lat === null) continue;
      this.eventIndex.set(ev.key, ev);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.lon, ev.lat] },
        properties: {
          key: ev.key,
          category: ev.category,
          color: css(`--cat-${ev.category}`, '#26406b'),
        },
      });
    }
    const source = map.getSource('events') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });
  }

  /**
   * Draw one person's life path.
   *
   * The same stops already feed the 3D globe; on the flat map they are a dashed
   * line through the life stages, because a solid line at this scale competes
   * with the polity borders it runs across.
   */
  renderTrajectory(stops: Array<{ lon: number; lat: number }>) {
    this.pendingTrajectory = stops;
    const map = this.map;
    if (!map || !this.ready) return;

    const features: GeoJSON.Feature[] = stops.map((stop) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      properties: {},
    }));

    if (stops.length > 1) {
      features.unshift({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: stops.map((stop) => [stop.lon, stop.lat]),
        },
        properties: {},
      });
    }

    const source = map.getSource('person-route') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });
  }

  clearTrajectory() {
    this.pendingTrajectory = [];
    const map = this.map;
    if (!map || !this.ready) return;
    (map.getSource('person-route') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
  }

  renderPolities(
    features: PolityFeature[],
    names: Record<string, string>,
    opts: { labels?: boolean; locale?: Locale } = {},
  ) {
    this.pendingPolities = features;
    this.polityIndex.clear();
    if (opts.locale) this.labelLocale = opts.locale;
    if (opts.labels !== undefined) this.labelsOn = opts.labels;
    // Names are built before the early return: the label set has to stay in step
    // with the data even while the map is still loading its style.
    this.buildLabelItems(features, names);

    const map = this.map;
    if (!map || !this.ready) return;
    // The hover state is keyed by feature id, so it has to be dropped before
    // the ids are reassigned to a different set of polygons.
    this.hoveredPolityId = null;
    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: features.map((feature, i) => {
        const props = feature.properties ?? {};
        const name = props.Name ?? '';
        const key = `${props.Name ?? ''}|${props.FromYear ?? ''}|${props.ToYear ?? ''}|${i}`;
        this.polityIndex.set(key, feature);
        return {
          type: 'Feature',
          // Numeric id, so `setFeatureState` can target this polygon.
          id: i,
          geometry: feature.geometry as GeoJSON.Geometry,
          properties: {
            key,
            name,
            label: names[name] || name,
            fill: css(
              `--${['indigo', 'olive', 'ochre', 'teal', 'violet', 'rust'][hashString(name) % 6]}`,
              '#26406b',
            ),
            stroke: css('--rule-3', '#a89f8d'),
          },
        };
      }),
    };
    const source = map.getSource('polities') as maplibregl.GeoJSONSource | undefined;
    source?.setData(collection);
  }

  clearPolities() {
    this.pendingPolities = [];
    this.labelItems = [];
    this.queueLabels();
    const map = this.map;
    if (!map || !this.ready) return;
    (map.getSource('polities') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
  }

  /* ── polity names ────────────────────────────────────────────────────── */

  /** Show or hide the polity names; the layer panel owns this switch. */
  setPolityLabels(on: boolean) {
    this.labelsOn = on;
    this.queueLabels();
  }

  private buildLabelItems(features: PolityFeature[], names: Record<string, string>) {
    const items: { text: string; lon: number; lat: number; weight: number }[] = [];

    for (const feature of features) {
      const props = feature.properties ?? {};
      const name = (props.Name ?? '').trim();
      if (!name) continue;
      const anchor = labelAnchor(feature);
      if (!anchor) continue;
      const zh = (names[name] ?? '').trim();
      items.push({
        text: this.labelLocale === 'en' ? name : zh || name,
        lon: anchor[0],
        lat: anchor[1],
        // `Area` orders importance: the big polity keeps its name when two collide.
        weight: Number(props.Area) || 0,
      });
    }

    items.sort((a, b) => b.weight - a.weight);
    this.labelItems = items;
    this.queueLabels();
  }

  private ensureLabelHost(): HTMLDivElement | null {
    if (this.labelHost) return this.labelHost;
    const map = this.map;
    if (!map) return null;
    const host = document.createElement('div');
    host.className = 'polity-labels';
    map.getContainer().appendChild(host);
    this.labelHost = host;
    return host;
  }

  private queueLabels() {
    if (this.labelFrame) return;
    this.labelFrame = requestAnimationFrame(() => {
      this.labelFrame = 0;
      this.paintLabels();
    });
  }

  /**
   * Reposition the name layer.
   *
   * Anchors are projected on every frame the map moves, so panning drags the
   * names with the polygons. Detail grows with zoom (a paper atlas adds names as
   * you lean in), and each name is dropped when it would overlap one already
   * placed — the same priority-by-size collision rule the big map products use,
   * which is what keeps 2086 polities from becoming a solid block of text.
   */
  private paintLabels() {
    const map = this.map;
    const host = this.ensureLabelHost();
    if (!map || !host) return;

    if (!this.labelsOn) {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';

    const zoom = map.getZoom();
    const limit = zoom < 2.5 ? 10 : zoom < 4 ? 26 : zoom < 6 ? 60 : 120;
    const width = host.clientWidth;
    const height = host.clientHeight;

    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    let used = 0;

    for (const item of this.labelItems) {
      if (used >= limit) break;

      const point = map.project([item.lon, item.lat]);
      if (point.x < 6 || point.y < 6 || point.x > width - 6 || point.y > height - 6) continue;

      const text = item.text.length > 14 ? `${item.text.slice(0, 13)}…` : item.text;
      const fontSize = zoom < 3 ? 11 : zoom < 5 ? 12 : 13;
      const boxW = text.length * fontSize * 1.02;
      const boxH = fontSize * 1.6;
      const box = {
        x1: point.x - boxW / 2,
        x2: point.x + boxW / 2,
        y1: point.y - boxH / 2,
        y2: point.y + boxH / 2,
      };

      const collides = placed.some(
        (other) => box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1,
      );
      if (collides) continue;
      placed.push(box);

      const el = this.labelElement(used);
      el.textContent = text;
      el.style.fontSize = `${fontSize}px`;
      el.style.transform = `translate3d(${Math.round(point.x)}px, ${Math.round(point.y)}px, 0) translate(-50%, -50%)`;
      el.style.display = '';
      used += 1;
    }

    for (let i = used; i < this.labelPool.length; i += 1) this.labelPool[i].style.display = 'none';
  }

  private labelElement(index: number): HTMLDivElement {
    const existing = this.labelPool[index];
    if (existing) return existing;
    const host = this.ensureLabelHost();
    const el = document.createElement('div');
    el.className = 'polity-label';
    el.style.display = 'none';
    host?.appendChild(el);
    this.labelPool[index] = el;
    return el;
  }

  /* ── modern borders ──────────────────────────────────────────────────── */

  /**
   * Natural Earth reference borders. Reported as a boolean for the same reason
   * as on the globe: the caller retries on the next toggle instead of caching a
   * failure forever.
   */
  async loadModernBorders(countriesUrl: string, bordersUrl: string): Promise<boolean> {
    const [countries, lines] = await Promise.all([
      fetchCollection(countriesUrl),
      fetchCollection(bordersUrl),
    ]);
    if (!countries || !lines) return false;

    this.borderCountries = countries;
    this.borderLines = lines;
    const map = this.map;
    if (!map || !this.ready) return true;

    (map.getSource('borders-countries') as maplibregl.GeoJSONSource | undefined)?.setData(countries);
    (map.getSource('borders-lines') as maplibregl.GeoJSONSource | undefined)?.setData(lines);
    this.setModernBordersVisible(this.bordersVisible);
    return true;
  }

  setModernBordersVisible(visible: boolean) {
    this.bordersVisible = visible;
    const map = this.map;
    if (!map || !this.ready) return;
    for (const id of ['borders-countries', 'borders-lines']) {
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }

  /* ── wars ────────────────────────────────────────────────────────────── */

  renderWars(wars: WarMarker[], activeId: string | null, _showLabels: boolean) {
    this.warFeatures = wars.map((war) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [war.lon, war.lat] },
      properties: { warId: war.warId, name: war.name, active: war.warId === activeId },
    }));
    this.repaintWars();
  }

  clearWars() {
    this.warFeatures = [];
    this.repaintWars();
  }

  private repaintWars() {
    const map = this.map;
    if (!map || !this.ready) return;
    (map.getSource('wars') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: this.warFeatures,
    });
  }

  resetView() {
    this.map?.flyTo({ center: [INITIAL_VIEW.lon, INITIAL_VIEW.lat], zoom: 2 });
  }

  flyTo(lon: number, lat: number, zoom?: number) {
    const map = this.map;
    if (!map) return;
    map.flyTo({ center: [lon, lat], zoom: zoom ?? Math.max(map.getZoom(), 5) });
  }

  private handleClick(e: maplibregl.MapMouseEvent) {
    const map = this.map;
    if (!map) return;
    const hits = map.queryRenderedFeatures(e.point, {
      layers: ['events', 'wars', 'polities-fill'],
    });

    // Resolved by layer instead of by hit order: the render order of the three
    // overlay layers is an implementation detail, the priority is not.
    const eventHit = hits.find((hit) => hit.layer.id === 'events');
    if (eventHit) {
      const event = this.eventIndex.get(eventHit.properties?.key as string);
      if (event) {
        this.callbacks.onPickEvent?.(event);
        return;
      }
    }

    const warHit = hits.find((hit) => hit.layer.id === 'wars');
    const warId = warHit?.properties?.warId as string | undefined;
    if (warId) {
      this.callbacks.onPickWar?.(warId);
      return;
    }

    const polityHit = hits.find((hit) => hit.layer.id === 'polities-fill');
    if (polityHit) {
      const polity = this.polityIndex.get(polityHit.properties?.key as string);
      if (polity) {
        this.callbacks.onPickPolity?.(polity);
        return;
      }
    }

    this.callbacks.onPickEvent?.(null);
  }

  private handleHover(e: maplibregl.MapMouseEvent) {
    const map = this.map;
    if (!map) return;
    const hits = map.queryRenderedFeatures(e.point, {
      layers: ['events', 'wars', 'polities-fill'],
    });

    const eventHit = hits.find((hit) => hit.layer.id === 'events');
    const event = eventHit ? this.eventIndex.get(eventHit.properties?.key as string) : undefined;
    if (event) {
      this.setPolityHover(null);
      map.getCanvas().style.cursor = 'pointer';
      this.callbacks.onHoverEvent?.({
        x: e.point.x,
        y: e.point.y,
        title: event.title,
        subtitle: event.region,
        categoryVar: `--cat-${event.category}`,
      });
      return;
    }

    const warHit = hits.find((hit) => hit.layer.id === 'wars');
    if (warHit) {
      this.setPolityHover(null);
      map.getCanvas().style.cursor = 'pointer';
      this.callbacks.onHoverEvent?.({
        x: e.point.x,
        y: e.point.y,
        title: String(warHit.properties?.name ?? ''),
        subtitle: '',
        categoryVar: '--rust',
      });
      return;
    }

    const polityHit = hits.find((hit) => hit.layer.id === 'polities-fill');
    const id = typeof polityHit?.id === 'number' ? polityHit.id : null;
    this.setPolityHover(id);
    map.getCanvas().style.cursor = polityHit ? 'pointer' : '';
    this.callbacks.onHoverEvent?.(null);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.labelFrame) cancelAnimationFrame(this.labelFrame);
    this.labelFrame = 0;
    // The host is a sibling of the canvas, so `map.remove()` does not take it.
    this.labelHost?.remove();
    this.labelHost = null;
    this.labelPool = [];
    this.labelItems = [];
    this.map?.remove();
    this.map = null;
    this.ready = false;
    this.hoveredPolityId = null;
  }
}

async function fetchCollection(url: string): Promise<FeatureCollection | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as FeatureCollection;
  } catch {
    return null;
  }
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export const map2d = new Map2D();
