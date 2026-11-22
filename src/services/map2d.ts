import type { Feature, FeatureCollection } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import { BASEMAPS, INITIAL_VIEW, type BaseKind } from '@/config';
import { formatYearCompact } from '@/lib/format';
import { neutralizeModernBoundaries, normalizeModernCountries } from '@/lib/modernBorders';
import { labelAnchor } from '@/lib/polityScope';
import type { TrailScene } from '@/lib/trajectory';
import type { HoverInfo, WarMarker } from '@/services/globe';
import { fetchOptionalJson } from '@/services/http';
import type { Locale, PolityFeature, TimelineEvent } from '@/types';
import type { StoryStep } from '@/types/story';

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

/** Smooth start-and-stop easing for the story route growth. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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

/** Screen-space box of one placed name, used for the overlap test. */
type LabelBox = { x1: number; y1: number; x2: number; y2: number };

export class Map2D {
  private map: maplibregl.Map | null = null;
  private callbacks: Map2DCallbacks = {};
  private base: BaseKind = 'standard';
  private ready = false;
  private pendingEvents: TimelineEvent[] = [];
  private pendingPolities: PolityFeature[] = [];
  /** Stops of the open person's route, kept so a style swap can redraw them. */
  private pendingTrajectory: TrailScene | null = null;
  /** The small account card for a clicked trail stop. */
  private trailPopup: maplibregl.Popup | null = null;
  /** A frame request that arrived before the style was ready. */
  private pendingFit: {
    bounds: [[number, number], [number, number]];
    padding: maplibregl.PaddingOptions;
  } | null = null;
  /**
   * The story region stays pending for the same reason: the map may be re-created
   * by a stage or basemap switch before its style is ready, so the region is
   * re-applied once the `story-region` source exists again.
   */
  private storyStep: StoryStep | null = null;
  private pendingStoryRegion: FeatureCollection | null = null;
  private storyMarker: maplibregl.Marker | null = null;
  /** Cancels the in-flight story route transition, if any. */
  private storyRouteCancel: (() => void) | null = null;
  /**
   * Pending `flyTo` promises, one settle function each.
   *
   * They resolve on `moveend`, which a removed map never fires: a view switch
   * mid-flight used to leave the promise pending forever, and the story step
   * chained on it never ran. `destroy()` settles them explicitly.
   */
  private flyToPending = new Set<() => void>();
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
  /** War names, gated by the labels switch like the globe's war labels. */
  private warLabelItems: { text: string; lon: number; lat: number }[] = [];
  /** Event titles, gated by the same switch as the globe's event captions. */
  private eventLabelItems: { text: string; lon: number; lat: number }[] = [];
  private eventLabelsOn = true;
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
      this.renderEvents(this.pendingEvents, { labels: this.eventLabelsOn });
      this.renderPolities(this.pendingPolities, {});
      this.renderTrajectory(this.pendingTrajectory);
      if (this.pendingFit) this.fitTrail(this.pendingFit.bounds, this.pendingFit.padding);
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
     * The open life path, above the events so the route is never buried.
     *
     * One source, three feature kinds. Colour and radius travel on each feature
     * so a single life can ramp from early to late and a comparison can colour
     * each person differently without adding a source per person.
     */
    map.addSource('person-route', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'person-route-casing',
      type: 'line',
      source: 'person-route',
      filter: ['==', ['get', 'kind'], 'segment'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': css('--paper', '#f7f5f0'),
        'line-width': 5,
        'line-opacity': 0.7,
      },
    });
    map.addLayer({
      id: 'person-route-line',
      type: 'line',
      source: 'person-route',
      filter: ['==', ['get', 'kind'], 'segment'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2.2,
        'line-opacity': 0.92,
      },
    });
    /*
     * Station markers have to read differently from ordinary event dots, which
     * are small flat circles in the same palette. The trail draws a soft paper
     * halo, a thick rim and a pale centre, so it looks struck into the map
     * rather than plotted on it.
     */
    map.addLayer({
      id: 'person-route-node-halo',
      type: 'circle',
      source: 'person-route',
      filter: ['==', ['get', 'kind'], 'node'],
      paint: {
        'circle-radius': ['+', ['get', 'radius'], 4.5],
        'circle-color': css('--paper', '#f7f5f0'),
        'circle-opacity': 0.55,
        'circle-blur': 0.6,
      },
    });
    map.addLayer({
      id: 'person-route-node',
      type: 'circle',
      source: 'person-route',
      filter: ['==', ['get', 'kind'], 'node'],
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': css('--paper', '#f7f5f0'),
        'circle-stroke-width': 2.2,
        'circle-opacity': 0.96,
      },
    });
    map.addLayer({
      id: 'person-route-node-core',
      type: 'circle',
      source: 'person-route',
      filter: ['==', ['get', 'kind'], 'node'],
      paint: {
        'circle-radius': 2.2,
        'circle-color': css('--paper', '#f7f5f0'),
        'circle-opacity': 0.95,
      },
    });
    map.addLayer({
      id: 'person-route-head',
      type: 'circle',
      source: 'person-route',
      filter: ['==', ['get', 'kind'], 'head'],
      paint: {
        'circle-radius': 10,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.25,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 2,
      },
    });

    // Story region highlight: a fill under a line, so the outline stays crisp
    // even where the wash overlaps neighbouring fills. The source is empty until
    // a story step asks for it.
    map.addSource('story-region', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'story-region-fill',
      type: 'fill',
      source: 'story-region',
      paint: { 'fill-color': '#c0392b', 'fill-opacity': 0.16 },
    });
    map.addLayer({
      id: 'story-region-line',
      type: 'line',
      source: 'story-region',
      paint: { 'line-color': '#c0392b', 'line-width': 2, 'line-opacity': 0.75 },
    });

    // The growing route line between two story steps. The colour is set per
    // leg (warm for land, cold for air/sea); dashes convey direction of travel.
    map.addSource('story-route', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'story-route-line',
      type: 'line',
      source: 'story-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2e86c1',
        'line-width': 3,
        'line-dasharray': [2, 1.5],
        'line-opacity': 0.9,
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

    // The story region may have been requested before the style finished loading.
    this.repaintStoryRegion();
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
      this.renderEvents(this.pendingEvents, { labels: this.eventLabelsOn });
      this.renderPolities(this.pendingPolities, {});
      this.renderTrajectory(this.pendingTrajectory);
    });
    map.setStyle(baseStyle(kind));
  }

  renderEvents(events: TimelineEvent[], opts: { labels: boolean }) {
    this.pendingEvents = events;
    this.eventLabelsOn = opts.labels;
    this.eventIndex.clear();

    // Same cap as the globe: a busy year would otherwise bury the map in text.
    const labelItems: { text: string; lon: number; lat: number }[] = [];
    if (opts.labels) {
      for (const ev of events) {
        if (labelItems.length >= 10) break;
        if (ev.lon === null || ev.lat === null) continue;
        labelItems.push({ text: ev.title, lon: ev.lon, lat: ev.lat });
      }
    }
    this.eventLabelItems = labelItems;
    this.queueLabels();

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
   * Draw the open life path as the scene the model produced.
   *
   * The scene already applied the time cursor, so this is a straight conversion
   * to GeoJSON; a leg cut at the cursor arrives as a shorter segment.
   */
  renderTrajectory(scene: TrailScene | null) {
    this.pendingTrajectory = scene;
    const map = this.map;
    if (!map || !this.ready) return;
    const source = map.getSource('person-route') as maplibregl.GeoJSONSource | undefined;
    if (!scene) {
      source?.setData(EMPTY);
      return;
    }

    const features: Feature[] = [];
    for (const segment of scene.segments) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: segment.coords },
        properties: { kind: 'segment', color: segment.color, personId: segment.personId },
      });
    }
    for (const node of scene.nodes) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
        properties: {
          kind: 'node',
          color: node.color,
          radius: node.radius,
          personId: node.personId,
          personName: node.personName,
          personNameEn: node.personNameEn,
          index: node.index,
          year: node.year,
          yearEnd: node.yearEnd,
          place: node.place,
          placeEn: node.placeEn,
          title: node.title,
          titleEn: node.titleEn,
        },
      });
    }
    for (const head of scene.heads) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [head.lon, head.lat] },
        properties: { kind: 'head', color: head.color, personId: head.personId },
      });
    }

    source?.setData({ type: 'FeatureCollection', features } as FeatureCollection);
  }

  clearTrajectory() {
    this.pendingTrajectory = null;
    this.pendingFit = null;
    this.trailPopup?.remove();
    this.trailPopup = null;
    const map = this.map;
    if (!map || !this.ready) return;
    (map.getSource('person-route') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
  }

  /**
   * Frame the ground the person actually walked.
   *
   * `padding` keeps the route clear of the person card on the left and the
   * lifeline drawer at the bottom.
   */
  fitTrail(
    bounds: [[number, number], [number, number]],
    padding: maplibregl.PaddingOptions = { top: 90, bottom: 300, left: 360, right: 90 },
  ) {
    const map = this.map;
    if (!map || !this.ready) {
      this.pendingFit = { bounds, padding };
      return;
    }
    this.pendingFit = null;
    map.fitBounds(bounds, { padding, duration: 700, maxZoom: 6.5 });
  }

  /* ── story region ────────────────────────────────────────────────────── */

  /**
   * Highlight the region the current story step is talking about.
   *
   * Mirrors `globe.showStoryRegion`: an explicit polygon when the step carries
   * one, otherwise a circle of `radiusKm` (default 260). The pointer is a DOM
   * marker — MapLibre text needs a glyph server, which this app does not host —
   * with a simple SVG pin and the region name above it.
   */
  showStoryRegion(step: StoryStep) {
    this.storyStep = step;
    this.pendingStoryRegion = storyRegionFeature(step);
    this.repaintStoryRegion();
  }

  clearStoryRegion() {
    this.storyStep = null;
    this.pendingStoryRegion = null;
    this.storyMarker?.remove();
    this.storyMarker = null;
    const map = this.map;
    if (map && this.ready) {
      (map.getSource('story-region') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
    }
  }

  /* ── story route transition ──────────────────────────────────────────── */

  /**
   * Animate a straight, dashed line growing between two story steps.
   *
   * No vertical arc here — the flat map keeps the leg as a straight line, its
   * dashes implying direction. The camera flies to the midpoint at zoom 3 while
   * the line grows, then to the destination at zoom 6. Resolves when done, and
   * on cancellation, so the player never stalls.
   */
  animateStoryRoute(
    from: StoryStep,
    to: StoryStep,
    mode: 'land' | 'air' | 'sea',
    durationMs = 2400,
  ): Promise<void> {
    const map = this.map;
    if (!map || !this.ready) return Promise.resolve();
    this.cancelStoryRoute();

    const coords = this.sampleStoryRoute2d(from, to);
    const mid = coords[Math.floor(coords.length / 2)];
    const isLand = mode === 'land';
    const color = isLand ? '#c0392b' : '#2e86c1';

    return new Promise<void>((resolve) => {
      let done = false;
      let rafId = 0;
      let count = 0;

      const settle = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(rafId);
        if (this.storyRouteCancel === cancel) this.storyRouteCancel = null;
        this.clearStoryRouteLine();
        resolve();
      };

      const cancel = () => settle();

      this.storyRouteCancel = cancel;

      try {
        map.setPaintProperty('story-route-line', 'line-color', color);
      } catch {
        settle();
        return;
      }

      void this.flyTo(mid[0], mid[1], 3)
        .then(() => {
          if (done) return;

          const source = map.getSource('story-route') as maplibregl.GeoJSONSource | undefined;
          const t0 = performance.now();
          const frame = (now: number) => {
            if (done) return;
            const t = Math.min(1, (now - t0) / durationMs);
            const target = Math.max(2, Math.ceil(easeInOutCubic(t) * coords.length));
            if (target !== count) {
              count = target;
              try {
                source?.setData({
                  type: 'FeatureCollection',
                  features: [
                    {
                      type: 'Feature',
                      geometry: { type: 'LineString', coordinates: coords.slice(0, count) },
                      properties: {},
                    },
                  ],
                });
              } catch {
                settle();
                return;
              }
            }
            if (t < 1) {
              rafId = requestAnimationFrame(frame);
              return;
            }
            // Leg drawn: fly to the destination, then tear the line down.
            void this.flyTo(to.lon, to.lat, 6).then(() => settle());
          };
          rafId = requestAnimationFrame(frame);
        })
        .catch(() => settle());
    });
  }

  /** Stop an in-flight story route transition and clear its line. */
  cancelStoryRoute() {
    this.storyRouteCancel?.();
    this.storyRouteCancel = null;
  }

  private clearStoryRouteLine() {
    const map = this.map;
    if (!map || !this.ready) return;
    (map.getSource('story-route') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
  }

  /** 128 linearly interpolated `[lon, lat]` points between two steps. */
  private sampleStoryRoute2d(from: StoryStep, to: StoryStep): Array<[number, number]> {
    const N = 128;
    const coords: Array<[number, number]> = [];
    for (let i = 0; i < N; i += 1) {
      const f = i / (N - 1);
      coords.push([from.lon + (to.lon - from.lon) * f, from.lat + (to.lat - from.lat) * f]);
    }
    return coords;
  }

  private repaintStoryRegion() {
    const map = this.map;
    if (!map || !this.ready) return;

    (map.getSource('story-region') as maplibregl.GeoJSONSource | undefined)?.setData(
      this.pendingStoryRegion ?? EMPTY,
    );

    this.storyMarker?.remove();
    this.storyMarker = null;
    if (this.storyStep) {
      this.storyMarker = new maplibregl.Marker({
        element: this.storyPinElement(this.storyStep.regionLabel ?? this.storyStep.title),
        anchor: 'bottom',
      })
        .setLngLat([this.storyStep.lon, this.storyStep.lat])
        .addTo(map);
    }
  }

  /** A tiny teardrop pin with the region name floating above it. */
  private storyPinElement(text: string): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '3px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 20 24');
    svg.style.filter = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.32))';

    const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    body.setAttribute('d', 'M10 0C5.6 0 2.5 4 2.5 8.5c0 5.6 7.5 13 7.5 13s7.5-7.4 7.5-13C17.5 4 14.4 0 10 0z');
    body.setAttribute('fill', '#c0392b');
    body.setAttribute('stroke', '#f7f5f0');
    body.setAttribute('stroke-width', '1.4');

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', '10');
    dot.setAttribute('cy', '8.5');
    dot.setAttribute('r', '2.6');
    dot.setAttribute('fill', '#f7f5f0');

    svg.appendChild(body);
    svg.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = text;
    label.style.font = '600 12px Inter, "Noto Sans SC", sans-serif';
    label.style.color = '#1a1c20';
    label.style.background = 'rgba(247, 245, 240, 0.82)';
    label.style.padding = '2px 6px';
    label.style.borderRadius = '3px';
    label.style.whiteSpace = 'nowrap';
    label.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.22)';

    wrap.appendChild(svg);
    wrap.appendChild(label);
    return wrap;
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

    if (!this.labelsOn && !this.eventLabelItems.length && !this.warLabelItems.length) {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';

    const zoom = map.getZoom();
    const limit = zoom < 2.5 ? 10 : zoom < 4 ? 26 : zoom < 6 ? 60 : 120;

    const placed: LabelBox[] = [];
    let used = 0;

    if (this.labelsOn) {
      for (const item of this.labelItems) {
        if (used >= limit) break;
        if (this.placeLabel(item, used, placed, 0, 'polity-label')) used += 1;
      }
    }

    // Event titles: the same ten captions the globe draws, lifted off their dot.
    for (const item of this.eventLabelItems) {
      if (this.placeLabel(item, used, placed, -14, 'polity-label event-label')) used += 1;
    }

    // Up to 18 theatres, the same cap as the globe; the active war sorts first.
    const warLimit = Math.min(this.warLabelItems.length, 18);
    for (let i = 0; i < warLimit; i += 1) {
      if (this.placeLabel(this.warLabelItems[i], used, placed, -18, 'polity-label war-label')) {
        used += 1;
      }
    }

    for (let i = used; i < this.labelPool.length; i += 1) this.labelPool[i].style.display = 'none';
  }

  /**
   * Place one name if it is on screen and does not overlap an earlier one.
   * `dy` lifts war names clear of their diamond.
   */
  private placeLabel(
    item: { text: string; lon: number; lat: number },
    index: number,
    placed: LabelBox[],
    dy: number,
    className: string,
  ): boolean {
    const map = this.map;
    const host = this.labelHost;
    if (!map || !host) return false;

    const point = map.project([item.lon, item.lat]);
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (point.x < 6 || point.y < 6 || point.x > width - 6 || point.y > height - 6) return false;

    const zoom = map.getZoom();
    const fontSize = zoom < 3 ? 11 : zoom < 5 ? 12 : 13;
    const text = item.text.length > 14 ? `${item.text.slice(0, 13)}…` : item.text;
    const boxW = text.length * fontSize * 1.02;
    const boxH = fontSize * 1.6;
    const y = point.y + dy;
    const box = {
      x1: point.x - boxW / 2,
      x2: point.x + boxW / 2,
      y1: y - boxH / 2,
      y2: y + boxH / 2,
    };

    const collides = placed.some(
      (other) => box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1,
    );
    if (collides) return false;
    placed.push(box);

    const el = this.labelElement(index);
    el.className = className;
    el.textContent = text;
    el.style.fontSize = `${fontSize}px`;
    el.style.transform = `translate3d(${Math.round(point.x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
    el.style.display = '';
    return true;
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
    const [rawCountries, rawLines] = await Promise.all([
      fetchCollection(countriesUrl),
      fetchCollection(bordersUrl),
    ]);
    if (!rawCountries || !rawLines) return false;

    // Same policy as the globe: Taiwan is folded into China, and disputed /
    // line-of-control / indefinite stretches are withheld (see
    // `lib/modernBorders`). The shipped files stay untouched.
    const countries = normalizeModernCountries(rawCountries);
    const lines = neutralizeModernBoundaries(rawLines);

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

  renderWars(wars: WarMarker[], activeId: string | null, showLabels: boolean) {
    this.warFeatures = wars.map((war) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [war.lon, war.lat] },
      properties: { warId: war.warId, name: war.name, active: war.warId === activeId },
    }));
    // MapLibre text needs a glyph server, which this app deliberately does not
    // host (CJK packs are tens of megabytes). The DOM label layer already solves
    // that for polity names, so war names ride on it instead.
    this.warLabelItems = showLabels
      ? [...wars]
          .sort(
            (a, b) => Number(b.warId === activeId) - Number(a.warId === activeId),
          )
          .slice(0, 18)
          .map((war) => ({ text: war.name, lon: war.lon, lat: war.lat }))
      : [];
    this.repaintWars();
    this.queueLabels();
  }

  clearWars() {
    this.warFeatures = [];
    this.warLabelItems = [];
    this.repaintWars();
    this.queueLabels();
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

  flyTo(lon: number, lat: number, zoom?: number): Promise<void> {
    const map = this.map;
    if (!map) return Promise.resolve();
    return new Promise<void>((resolve) => {
      // MapLibre's `flyTo` returns the map, not a promise; `moveend` is the
      // signal the story uses to know the camera has arrived.
      const settle = () => {
        map.off('moveend', settle);
        this.flyToPending.delete(settle);
        resolve();
      };
      this.flyToPending.add(settle);
      map.on('moveend', settle);
      map.flyTo({ center: [lon, lat], zoom: zoom ?? Math.max(map.getZoom(), 5) });
    });
  }

  /** Resolves every in-flight `flyTo`; the camera will never move again. */
  private settleFlights() {
    const pending = [...this.flyToPending];
    this.flyToPending.clear();
    for (const settle of pending) settle();
  }

  /** Flat-map centre and zoom, so a story can restore the reader's view. */
  cameraView(): { lon: number; lat: number; zoom: number } | null {
    const map = this.map;
    if (!map) return null;
    const center = map.getCenter();
    return { lon: center.lng, lat: center.lat, zoom: map.getZoom() };
  }

  /** A clicked stop: the year, the place and what happened there. */
  private showTrailPopup(hit: maplibregl.MapGeoJSONFeature, at: maplibregl.LngLat) {
    const map = this.map;
    if (!map) return;
    const props = hit.properties ?? {};
    const en = this.labelLocale === 'en';
    const who = String((en ? props.personNameEn : props.personName) || props.personName || '');
    const place = String((en ? props.placeEn : props.place) || props.place || '');
    const title = String((en ? props.titleEn : props.title) || props.title || '');
    const year = Number(props.year);
    const yearEnd = Number(props.yearEnd ?? props.year);
    const years = Number.isFinite(year)
      ? `${formatYearCompact(year, this.labelLocale)}${
          yearEnd !== year ? ` – ${formatYearCompact(yearEnd, this.labelLocale)}` : ''
        }`
      : '';
    const stay =
      Number.isFinite(year) && yearEnd > year
        ? en
          ? `${yearEnd - year} yr`
          : `停留 ${yearEnd - year} 年`
        : '';
    const meta = stay ? `${years} · ${stay}` : years;

    this.trailPopup?.remove();
    this.trailPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 12,
      maxWidth: '280px',
    })
      .setLngLat(at)
      .setHTML(
        `<div style="font-family:inherit;color:#3f4145">
          <div style="font-size:11px;letter-spacing:.05em;color:#8a7a5c">${escapeHtml(meta)}</div>
          ${who ? `<div style="font-size:11px;color:${escapeHtml(String(props.color || '#8a7a5c'))};margin-top:2px">${escapeHtml(who)}</div>` : ''}
          <div style="font-weight:600;font-size:13px;margin:2px 0 3px">${escapeHtml(place)}</div>
          <div style="font-size:12px;line-height:1.55;color:#63666b">${escapeHtml(title)}</div>
        </div>`,
      )
      .addTo(map);
  }

  private handleClick(e: maplibregl.MapMouseEvent) {
    const map = this.map;
    if (!map) return;

    // The open route owns the click: a stop is a specific place in a life.
    if (map.getLayer('person-route-node')) {
      const stop = map.queryRenderedFeatures(e.point, { layers: ['person-route-node'] })[0];
      if (stop) {
        this.showTrailPopup(stop, e.lngLat);
        return;
      }
    }
    this.trailPopup?.remove();
    this.trailPopup = null;

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
    if (
      map.getLayer('person-route-node') &&
      map.queryRenderedFeatures(e.point, { layers: ['person-route-node'] }).length
    ) {
      this.setPolityHover(null);
      this.callbacks.onHoverEvent?.(null);
      map.getCanvas().style.cursor = 'pointer';
      return;
    }
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
    this.trailPopup?.remove();
    this.trailPopup = null;
    if (this.labelFrame) cancelAnimationFrame(this.labelFrame);
    this.labelFrame = 0;
    this.cancelStoryRoute();
    // A flight still waiting on `moveend` would never settle once the map is
    // removed, so its continuation (the story step) would be dropped silently.
    this.settleFlights();
    // The host is a sibling of the canvas, so `map.remove()` does not take it.
    this.labelHost?.remove();
    this.labelHost = null;
    this.labelPool = [];
    this.labelItems = [];
    this.storyMarker?.remove();
    this.storyMarker = null;
    this.map?.remove();
    this.map = null;
    this.ready = false;
    this.hoveredPolityId = null;
  }
}

/** Popup bodies are assembled as HTML, so every dataset string is escaped. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

async function fetchCollection(url: string): Promise<FeatureCollection | null> {
  const { data, ok } = await fetchOptionalJson<FeatureCollection | null>(url, null);
  return ok ? data : null;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Kilometres per degree of latitude/longitude at the equator (mean Earth). */
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;

/** Story region circles were oversized; scale down the authored radius. */
const STORY_RADIUS_SCALE = 0.2;

/** A 64-gon circle of `radiusKm` around a point, round on the globe. */
function circleRing(
  lon: number,
  lat: number,
  radiusKm: number,
  segments = 64,
): [number, number][] {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLon = radiusKm / (KM_PER_DEG_LON * Math.max(Math.cos((lat * Math.PI) / 180), 1e-3));
  const ring: [number, number][] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]);
  }
  return ring;
}

/** Close a ring if the author left it open. */
function closedRing(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

/** The story region as a GeoJSON feature, ready for the `story-region` source. */
function storyRegionFeature(step: StoryStep): FeatureCollection {
  const ring = closedRing(
    step.region && step.region.length >= 3
      ? step.region
      : circleRing(step.lon, step.lat, (step.radiusKm ?? 260) * STORY_RADIUS_SCALE),
  );
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      },
    ],
  };
}

export const map2d = new Map2D();
