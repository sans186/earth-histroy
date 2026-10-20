import * as Cesium from 'cesium';
import {
  BOUNDARY_ALTITUDE,
  INITIAL_VIEW,
  MAX_ZOOM_DISTANCE,
  POLITY_LOD_HEIGHT,
  polityCapForHeight,
} from '@/config';
import { bboxIntersects } from '@/lib/geo';
import type { PolityFeature, PreparedPolity, TimelineEvent } from '@/types';

/**
 * Globe engine.
 *
 * Deliberately NOT reactive: Cesium objects must never pass through Vue's
 * Proxy, or every property access in the render loop gets intercepted.
 *
 * Responsibilities: viewer lifecycle, imagery, a single pick pipeline for all
 * overlay layers, and rendering of events / historical polities / modern
 * borders.
 */

const PALETTE = ['--indigo', '--olive', '--ochre', '--teal', '--violet', '--rust'];

function css(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export interface HoverInfo {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  categoryVar: string;
}

export interface GlobeCallbacks {
  onPickEvent?: (event: TimelineEvent) => void;
  onHoverEvent?: (info: HoverInfo | null) => void;
  onPickPolity?: (feature: PolityFeature) => void;
  onHoverPolity?: (feature: PolityFeature | null) => void;
  onPickWar?: (warId: string) => void;
  onViewChange?: () => void;
}

/** One war theatre, as plotted on the globe. */
export interface WarMarker {
  warId: string;
  name: string;
  lon: number;
  lat: number;
  battles: number;
  startYear: number | null;
  endYear: number | null;
  eraColor: string;
}

/**
 * Wars are drawn as hollow diamonds rather than dots, so they read as a
 * different kind of thing from the round event markers without needing a legend
 * entry to explain them.
 */
function diamondTexture(fill: string, stroke: string, size = 24): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const c = size / 2;
  ctx.beginPath();
  ctx.moveTo(c, 1.5);
  ctx.lineTo(size - 1.5, c);
  ctx.lineTo(c, size - 1.5);
  ctx.lineTo(1.5, c);
  ctx.closePath();
  if (fill !== 'none') {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  return canvas;
}

interface PolityHandle {
  entity: Cesium.Entity;
  feature: PolityFeature;
  fill: Cesium.Color;
  stroke: Cesium.Color;
}

/**
 * Cesium does not export the type of a pick result, so its shape is declared
 * here instead of reaching for a namespace member that does not exist.
 */
interface PickResult {
  id?: unknown;
  primitive?: { id?: unknown };
}

class GlobeEngine {
  viewer: Cesium.Viewer | null = null;
  private callbacks: GlobeCallbacks = {};

  private points: Cesium.PointPrimitiveCollection | null = null;
  private labels: Cesium.LabelCollection | null = null;

  private warBillboards: Cesium.BillboardCollection | null = null;
  private warLabels: Cesium.LabelCollection | null = null;
  private warTextures: { idle: HTMLCanvasElement; active: HTMLCanvasElement } | null = null;

  private polityLayer = new Cesium.CustomDataSource('polities');
  private handles: PolityHandle[] = [];
  private sceneHandles = new Map<string, PolityHandle>();
  private hovered: PolityHandle | null = null;
  /** Polygon parts skipped in the last render purely for budget reasons. */
  private withheld = 0;

  private bordersDS: Cesium.GeoJsonDataSource | null = null;
  private countriesDS: Cesium.GeoJsonDataSource | null = null;
  /**
   * Last visibility the reader asked for.
   *
   * These sources load asynchronously and used to hard-code `show = false` when
   * they arrived. Flipping the switch on during that first load therefore left
   * a fully loaded layer that never displayed — and turning it off and on again
   * did nothing, because the flag was reapplied to an already-hidden source.
   */
  private bordersWanted = false;
  /** Recent render-error timestamps, used to rate-limit restarts. */
  private renderErrorTimes: number[] = [];

  private handlers: Cesium.ScreenSpaceEventHandler[] = [];
  private abort = new AbortController();
  private imagery: Cesium.ImageryLayer | null = null;
  private grid: Cesium.ImageryLayer | null = null;
  private base: 'standard' | 'satellite' = 'standard';
  private eventIndex: TimelineEvent[] = [];

  /* ── lifecycle ───────────────────────────────────────────────────────── */

  async init(container: HTMLElement, callbacks: GlobeCallbacks): Promise<void> {
    // A second mount without an unmount would otherwise stack handlers on a
    // dead viewer.
    if (this.viewer && !this.viewer.isDestroyed()) this.destroy();
    if (this.abort.signal.aborted) this.abort = new AbortController();
    this.callbacks = callbacks;

    const viewer = new Cesium.Viewer(container, {
      // No Ion assets at all: imagery is supplied by us, so no token is needed.
      baseLayer: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      geocoder: false,
      infoBox: false,
      selectionIndicator: false,
      skyBox: false,
      skyAtmosphere: false,
      shouldAnimate: true,
      contextOptions: { webgl: { alpha: false } },
    });

    this.viewer = viewer;

    const scene = viewer.scene;
    scene.backgroundColor = Cesium.Color.fromCssColorString(css('--paper', '#f7f5f0'));
    scene.globe.baseColor = Cesium.Color.fromCssColorString(css('--paper-2', '#efece4'));
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    scene.fog.enabled = false;
    scene.highDynamicRange = false;
    // Printed-map look: no tile fade flicker, no bright sun glare.
    scene.globe.depthTestAgainstTerrain = false;

    const controller = scene.screenSpaceCameraController;
    controller.minimumZoomDistance = 500;
    controller.maximumZoomDistance = MAX_ZOOM_DISTANCE;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        INITIAL_VIEW.lon,
        INITIAL_VIEW.lat,
        INITIAL_VIEW.height,
      ),
    });

    this.applyImagery('standard');
    this.addGraticule();
    this.addLayerDataSources();
    this.installPickPipeline();

    viewer.camera.moveEnd.addEventListener(() => this.callbacks.onViewChange?.());

    /*
     * Cesium stops its render loop on the first exception thrown while drawing.
     * From then on the globe is frozen: every later layer toggle writes state
     * that is never drawn, which readers experience as "关掉再打开就不显示" rather
     * than as a crash — the error is only visible in the console.
     *
     * Restart the loop a bounded number of times. A persistent fault would spin
     * forever, so the counter gives up and leaves the console message as the
     * trail to follow.
     */
    scene.renderError.addEventListener((_scene: Cesium.Scene, error: Error) => {
      console.error('[globe] render error', error);

      /*
       * Rate-limit rather than cap the total. A fixed budget of restarts ran
       * out after a few layer toggles and then the globe stayed dead for the
       * rest of the session — with no visible reason, since the error only
       * appears in the console. A short window still stops a fault that fires
       * every frame from spinning, while an occasional one can always recover.
       */
      const now = Date.now();
      this.renderErrorTimes = this.renderErrorTimes.filter((at) => now - at < 5_000);
      if (this.renderErrorTimes.length >= 3) return;
      this.renderErrorTimes.push(now);

      window.setTimeout(() => {
        if (this.viewer !== viewer) return;
        viewer.useDefaultRenderLoop = true;
        // Some faults leave the scene believing it has nothing to draw; asking
        // for one more frame is what actually brings the layers back.
        viewer.scene.requestRender();
      }, 0);
    });
  }

  destroy(): void {
    this.abort.abort();
    for (const h of this.handlers) {
      if (!h.isDestroyed()) h.destroy();
    }
    this.handlers = [];
    this.handles = [];
    this.sceneHandles.clear();
    this.hovered = null;
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
    this.viewer = null;
    this.points = null;
    this.labels = null;
    this.warBillboards = null;
    this.warLabels = null;
    this.warTextures = null;
    /*
     * Everything below died with the viewer. A remount (Vite HMR re-executes
     * this module only for non-component files, but a hot component update
     * remounts GlobeStage) used to inherit these: the aborted signal made
     * `loadModernBorders` bail out after its first await, and re-adding a
     * destroyed data source threw. Reset so `init()` starts clean.
     */
    this.abort = new AbortController();
    this.bordersDS = null;
    this.countriesDS = null;
    this.bordersWanted = false;
    this.imagery = null;
    this.grid = null;
  }

  /**
   * One data source for the polity layer, replaced on every render.
   *
   * Cesium caches the primitive that batches a data source's polygons, and a
   * batch whose geometry build throws (the worker reports
   * `RangeError: Too many properties to enumerate` for a pathological ring)
   * stays FAILED: `ready` never turns true, so `Batch.update` never calls
   * `primitive.show = true` and the layer stays blank for the rest of the
   * session. Clearing entities is not enough — the batch is kept. Swapping in
   * a fresh data source rebuilds the visualizers and their batches, which is
   * the only supported way back.
   *
   * A viewer's `destroy()` also destroys its data sources, so a new instance
   * is created here rather than reusing the field.
   */
  private addLayerDataSources() {
    const viewer = this.viewer;
    if (!viewer) return;
    this.polityLayer = new Cesium.CustomDataSource('polities');
    viewer.dataSources.add(this.polityLayer);
  }

  /** Moves the polity layer onto a new data source, dropping the old batches. */
  private renewPolityLayer(viewer: Cesium.Viewer): Cesium.CustomDataSource {
    const next = new Cesium.CustomDataSource('polities');
    viewer.dataSources.add(next);
    const previous = this.polityLayer;
    this.polityLayer = next;
    if (viewer.dataSources.contains(previous)) {
      viewer.dataSources.remove(previous, true);
    }
    return next;
  }

  /* ── imagery ─────────────────────────────────────────────────────────── */

  applyImagery(kind: 'standard' | 'satellite') {
    const viewer = this.viewer;
    if (!viewer) return;
    this.base = kind;

    if (this.imagery) viewer.imageryLayers.remove(this.imagery, true);

    const provider =
      kind === 'standard'
        ? new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            credit: '© OpenStreetMap contributors',
            maximumLevel: 18,
          })
        : new Cesium.UrlTemplateImageryProvider({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            credit: 'Esri World Imagery',
            maximumLevel: 18,
          });

    const layer = viewer.imageryLayers.addImageryProvider(provider);
    // Standard OSM is toned down towards paper; satellite keeps more body.
    layer.brightness = Number(css('--imagery-brightness', '1.06'));
    layer.saturation = kind === 'standard'
      ? Number(css('--imagery-saturation', '0.34'))
      : 0.62;
    layer.contrast = Number(css('--imagery-contrast', '0.94'));
    layer.gamma = Number(css('--imagery-gamma', '1.02'));
    this.imagery = layer;
    // raiseToTop lives on the collection, not on the layer — calling it on the
    // layer would throw the first time the basemap is switched.
    if (this.grid) viewer.imageryLayers.raiseToTop(this.grid);
  }

  private addGraticule() {
    const viewer = this.viewer;
    if (!viewer) return;
    const gridColor = Cesium.Color.fromCssColorString(css('--globe-grid', '#9a917f'));
    const provider = new Cesium.GridImageryProvider({
      cells: 2,
      color: gridColor.withAlpha(0.28),
      glowColor: Cesium.Color.TRANSPARENT,
      glowWidth: 0,
      backgroundColor: Cesium.Color.TRANSPARENT,
    });
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = 0.55;
    this.grid = layer;
  }

  /* ── pick pipeline (one click + one move for every layer) ────────────── */

  private installPickPipeline() {
    const viewer = this.viewer;
    if (!viewer) return;
    const canvas = viewer.scene.canvas;

    const click = new Cesium.ScreenSpaceEventHandler(canvas);
    click.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picks = viewer.scene.drillPick(movement.position, 6);
      for (const pick of picks) {
        const ev = this.eventFromPick(pick);
        if (ev) {
          this.callbacks.onPickEvent?.(ev);
          return;
        }
        const polity = this.polityFromPick(pick);
        if (polity) {
          this.callbacks.onPickPolity?.(polity.feature);
          return;
        }
        const war = this.warFromPick(pick);
        if (war) {
          this.callbacks.onPickWar?.(war);
          return;
        }
      }
      // Nothing hit: clear the selection.
      this.callbacks.onPickEvent?.(null as unknown as TimelineEvent);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    this.handlers.push(click);

    let queued = false;
    let last: Cesium.Cartesian2 | null = null;
    let prev: Cesium.Cartesian2 | null = null;
    let travelled = 0;
    let pickedAt = 0;
    const move = new Cesium.ScreenSpaceEventHandler(canvas);
    move.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      last = movement.endPosition;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!last) return;
        /*
         * A pick is an off-screen scene render, so it costs far more than a
         * frame. Two gates keep it off the hot path: the pointer must have
         * travelled at all (sub-pixel jitter never triggers a pick), and no
         * second pick may start within 80 ms of the last one.
         *
         * Distance accumulates frame to frame. An earlier version measured
         * from the position of the last *successful* pick, which deadlocked:
         * that anchor started null, so the very first move could never reach
         * the threshold, so the anchor was never set, so no hover ever fired.
         */
        const now = performance.now();
        if (prev) {
          travelled += Math.abs(last.x - prev.x) + Math.abs(last.y - prev.y);
        }
        prev = Cesium.Cartesian2.clone(last);
        if (travelled < 3 || now - pickedAt < 80) return;
        travelled = 0;
        pickedAt = now;
        this.handleHover(last);
      });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this.handlers.push(move);
  }

  private eventFromPick(pick: PickResult | undefined): TimelineEvent | null {
    if (!pick) return null;
    const id = (pick as { id?: unknown }).id;
    if (id && typeof id === 'object' && 'category' in (id as object) && 'year' in (id as object)) {
      return id as TimelineEvent;
    }
    const primitiveId = (pick.primitive as { id?: unknown } | undefined)?.id;
    if (
      primitiveId &&
      typeof primitiveId === 'object' &&
      'category' in (primitiveId as object) &&
      'year' in (primitiveId as object)
    ) {
      return primitiveId as TimelineEvent;
    }
    return null;
  }

  private polityFromPick(pick: PickResult | undefined): PolityHandle | null {
    if (!pick) return null;
    const entity = (pick as { id?: unknown }).id;
    if (entity instanceof Cesium.Entity) {
      const handle = this.sceneHandles.get(entity.id as unknown as string);
      if (handle) return handle;
    }
    const byId = entity as string | undefined;
    if (typeof byId === 'string') return this.sceneHandles.get(byId) ?? null;
    return null;
  }

  private warFromPick(pick: PickResult | undefined): string | null {
    if (!pick) return null;
    const id = (pick as { id?: unknown }).id;
    if (id && typeof id === 'object' && 'warId' in (id as object)) {
      return (id as WarMarker).warId;
    }
    return null;
  }

  private handleHover(position: Cesium.Cartesian2) {
    const viewer = this.viewer;
    if (!viewer) return;

    /*
     * One pick, not six.
     *
     * `drillPick(position, 6)` re-renders the whole scene into the pick buffer
     * once per hit it looks for, so a single mouse move could cost six full
     * scene passes — that is the ~1 s stall on hover. Event markers and war
     * billboards both float at BOUNDARY_ALTITUDE, well above the ground-level
     * polygons, so the single top-most hit already resolves them in the right
     * order. Nothing here needs to see through a polygon.
     */
    const pick = viewer.scene.pick(position) as PickResult | undefined;

    const event = this.eventFromPick(pick);
    const polity = event ? null : this.polityFromPick(pick);
    const warId = event || polity ? null : this.warFromPick(pick);

    // Event tooltip
    if (event) {
      viewer.scene.canvas.style.cursor = 'pointer';
      this.callbacks.onHoverEvent?.({
        x: position.x,
        y: position.y,
        title: event.title,
        subtitle: event.region,
        categoryVar: `--cat-${event.category}`,
      });
    } else {
      viewer.scene.canvas.style.cursor = polity || warId ? 'pointer' : 'default';
      this.callbacks.onHoverEvent?.(null);
    }

    // Polity highlight — restores cleanly or clears.
    if (polity !== this.hovered) {
      this.clearHighlight();
      if (polity) this.applyHighlight(polity);
      this.hovered = polity;
      this.callbacks.onHoverPolity?.(polity?.feature ?? null);
    }
  }

  private applyHighlight(handle: PolityHandle) {
    const { entity } = handle;
    if (!this.polityLayer.entities.contains(entity)) return;
    const brighter = handle.fill.withAlpha(Math.min(1, handle.fill.alpha + 0.32));
    if (entity.polygon) {
      entity.polygon.material = new Cesium.ColorMaterialProperty(brighter);
      entity.polygon.outlineColor = new Cesium.ConstantProperty(
        Cesium.Color.fromCssColorString(css('--accent', '#b0522d')).withAlpha(0.95),
      );
    }
  }

  private clearHighlight() {
    const handle = this.hovered;
    if (!handle) return;
    // Only touch the entity if it still belongs to the current render.
    if (this.polityLayer.entities.contains(handle.entity) && handle.entity.polygon) {
      handle.entity.polygon.material = new Cesium.ColorMaterialProperty(handle.fill);
      handle.entity.polygon.outlineColor = new Cesium.ConstantProperty(handle.stroke);
    }
  }

  /* ── events ──────────────────────────────────────────────────────────── */

  /**
   * Collection accessors.
   *
   * `PrimitiveCollection.add()` is typed as returning `any`, so assigning its
   * result to a nullable field does not narrow the null away. These helpers
   * return a definitely-non-null collection instead.
   */
  private ensurePoints(viewer: Cesium.Viewer): Cesium.PointPrimitiveCollection {
    if (!this.points) {
      const created = new Cesium.PointPrimitiveCollection();
      viewer.scene.primitives.add(created);
      this.points = created;
    }
    return this.points;
  }

  private ensureLabels(viewer: Cesium.Viewer): Cesium.LabelCollection {
    if (!this.labels) {
      const created = new Cesium.LabelCollection();
      viewer.scene.primitives.add(created);
      this.labels = created;
    }
    return this.labels;
  }

  private ensureWarBillboards(viewer: Cesium.Viewer): Cesium.BillboardCollection {
    if (!this.warBillboards) {
      const created = new Cesium.BillboardCollection();
      viewer.scene.primitives.add(created);
      this.warBillboards = created;
    }
    return this.warBillboards;
  }

  private ensureWarLabels(viewer: Cesium.Viewer): Cesium.LabelCollection {
    if (!this.warLabels) {
      const created = new Cesium.LabelCollection();
      viewer.scene.primitives.add(created);
      this.warLabels = created;
    }
    return this.warLabels;
  }

  renderEvents(events: TimelineEvent[], opts: { labels: boolean }) {
    const viewer = this.viewer;
    if (!viewer) return;

    const points = this.ensurePoints(viewer);
    const labels = this.ensureLabels(viewer);
    points.removeAll();
    labels.removeAll();
    this.eventIndex = events;

    /*
     * Labels are the one thing on this globe that cannot scale: a busy year has
     * hundreds of events within a few hundred pixels, so every additional label
     * makes the rest harder to read. Rather than draw 26 overlapping captions,
     * draw ten, and only when the camera is close enough that ten is not a
     * crowd. Zoomed out, hover already names an event on demand.
     */
    let labelled = 0;
    const MAX_LABELS = 10;

    for (const ev of events) {
      if (ev.lon === null || ev.lat === null) continue;
      const position = Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, BOUNDARY_ALTITUDE);
      const color = Cesium.Color.fromCssColorString(css(`--cat-${ev.category}`, '#26406b'));

      points.add({
        position,
        color,
        pixelSize: 9,
        outlineColor: Cesium.Color.fromCssColorString(css('--globe-marker-ring', '#fdfcf9')),
        outlineWidth: 2,
        id: ev,
        scaleByDistance: new Cesium.NearFarScalar(1.0e6, 1.25, 1.6e7, 0.6),
        translucencyByDistance: new Cesium.NearFarScalar(1.0e6, 1, 2.0e7, 0.35),
      });

      if (opts.labels && labelled < MAX_LABELS) {
        labelled += 1;
        labels.add({
          position,
          text: ev.title,
          font: '500 13px Inter, "Noto Sans SC", sans-serif',
          fillColor: Cesium.Color.fromCssColorString(css('--ink', '#1a1c20')).withAlpha(0.92),
          outlineColor: Cesium.Color.fromCssColorString(css('--paper', '#f7f5f0')).withAlpha(0.95),
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(4.0e5, 1, 2.2e6, 0.75),
          // Near the ground only. Ten captions at globe scale still collide, and
          // at that distance hover already names whatever is under the pointer.
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2.2e6),
          // Polities and terrain would otherwise swallow the captions entirely.
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          id: ev,
        });
      }
    }
  }

  clearEvents() {
    this.points?.removeAll();
    this.labels?.removeAll();
    this.eventIndex = [];
  }

  /* ── wars ────────────────────────────────────────────────────────────── */

  /**
   * One diamond per war theatre. The selected war is drawn filled and slightly
   * larger so it stays findable among a few hundred hollow outlines.
   */
  renderWars(wars: WarMarker[], activeId: string | null, showLabels: boolean) {
    const viewer = this.viewer;
    if (!viewer) return;

    const billboards = this.ensureWarBillboards(viewer);
    const warLabels = this.ensureWarLabels(viewer);
    billboards.removeAll();
    warLabels.removeAll();

    if (!this.warTextures) {
      this.warTextures = {
        idle: diamondTexture('none', css('--ink', '#1a1c20')),
        active: diamondTexture(css('--rust', '#b0522d'), css('--rust', '#b0522d')),
      };
    }
    const textures = this.warTextures;

    let labelled = 0;
    const MAX_WAR_LABELS = 18;

    for (const war of wars) {
      const isActive = war.warId === activeId;
      const position = Cesium.Cartesian3.fromDegrees(war.lon, war.lat, BOUNDARY_ALTITUDE);

      billboards.add({
        position,
        image: isActive ? textures.active : textures.idle,
        width: isActive ? 26 : 18,
        height: isActive ? 26 : 18,
        id: war,
        scaleByDistance: new Cesium.NearFarScalar(1.0e6, 1.2, 2.0e7, 0.55),
        translucencyByDistance: new Cesium.NearFarScalar(1.0e6, 1, 2.0e7, 0.4),
      });

      if (showLabels && labelled < MAX_WAR_LABELS) {
        labelled += 1;
        warLabels.add({
          position,
          text: war.name,
          font: '600 12px "Noto Serif SC", Fraunces, serif',
          fillColor: Cesium.Color.fromCssColorString(css('--ink-2', '#4c4f56')).withAlpha(0.92),
          outlineColor: Cesium.Color.fromCssColorString(css('--paper', '#f7f5f0')).withAlpha(0.9),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -17),
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(8.0e5, 1, 5.0e6, 0.6),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6.0e6),
          id: war,
        });
      }
    }
  }

  clearWars() {
    this.warBillboards?.removeAll();
    this.warLabels?.removeAll();
  }

  /* ── historical polities ─────────────────────────────────────────────── */

  /**
   * Render the polities active in `year`.
   *
   * Two behaviours differ from the previous implementation on purpose:
   *   1. no flat 800-feature truncation — the cap scales with camera altitude,
   *      and the layer reports how many were withheld instead of dropping them
   *      silently;
   *   2. boundaries are the polygon outline itself, so they can never be
   *      occluded by the surface the way a ground-hugging polyline was.
   */
  renderPolities(features: PolityFeature[], names: Record<string, string>) {
    const viewer = this.viewer;
    if (!viewer) return;

    this.clearHighlight();
    this.hovered = null;
    const entities = this.renewPolityLayer(viewer).entities;
    this.handles = [];
    this.sceneHandles.clear();

    entities.suspendEvents();
    let withheldParts = 0;

    try {
      for (const feature of features) {
        const props = feature.properties ?? {};
        const name = props.Name ?? '';
        if (!name) continue;

        const fill = Cesium.Color.fromCssColorString(
          css(PALETTE[hashString(name) % PALETTE.length], '#26406b'),
        ).withAlpha(0.42);
        const stroke = Cesium.Color.fromCssColorString(css('--rule-3', '#a89f8d')).withAlpha(0.85);

        const polygons: number[][][][] =
          feature.geometry.type === 'Polygon'
            ? [feature.geometry.coordinates as number[][][]]
            : (feature.geometry.coordinates as number[][][][]);

        // Every polygon part is drawn — truncating to the first few is what made
        // composite polities look half-missing (British Empire: 170 parts,
        // British Colonial Empire: 133, USA: 72). Parts are ordered large-first
        // so that if the camera is pulled far enough back to reach the safety
        // budget it is the peripheral islands that go, not the mainland.
        const budget = polityPartBudget(this.cameraHeight());
        const parts = polygons
          .map((rings) => ({ rings, area: ringArea(rings[0]) }))
          .filter((part) => part.rings[0] && part.rings[0].length >= 4)
          .sort((a, b) => b.area - a.area);
        withheldParts += Math.max(0, parts.length - budget);

        for (const { rings } of parts.slice(0, budget)) {
          const outer = rings[0];
          // Guards against the subdivision blow-up that fails the whole batch:
          // one ring with tens of thousands of vertices, or with coincident
          // consecutive vertices (a zero-length edge divides by zero in
          // Cesium's rhumb-line subdivision count).
          if (outer.length > 20_000) continue;
          const flat: number[] = [];
          let lastLon = Number.NaN;
          let lastLat = Number.NaN;
          for (const point of outer) {
            const lon = point[0];
            const lat = point[1];
            // One non-finite ordinate turns the polygon into NaN geometry, and
            // Cesium then fails somewhere far away from this line. Drop the
            // vertex here so the damage stays local.
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
            if (lon === lastLon && lat === lastLat) continue;
            flat.push(lon, lat);
            lastLon = lon;
            lastLat = lat;
          }
          // Fewer than three vertices cannot enclose an area.
          if (flat.length < 6) continue;
          try {
            const entity = entities.add({
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy(
                  Cesium.Cartesian3.fromDegreesArray(flat),
                ),
                material: new Cesium.ColorMaterialProperty(fill),
                outline: true,
                outlineColor: new Cesium.ConstantProperty(stroke),
                height: 0,
                perPositionHeight: false,
                arcType: Cesium.ArcType.GEODESIC,
              },
            });
            const handle: PolityHandle = { entity, feature, fill, stroke };
            this.handles.push(handle);
            this.sceneHandles.set(entity.id as unknown as string, handle);
          } catch {
            // A single malformed ring must not abort the whole layer.
          }
        }
      }
    } finally {
      entities.resumeEvents();
    }

    this.withheld = withheldParts;

    const zh = names;
    void zh;
  }

  /** Polygon parts not drawn in the last render because of the camera budget. */
  withheldPartCount(): number {
    return this.withheld;
  }

  clearPolities() {
    this.clearHighlight();
    this.hovered = null;
    this.polityLayer.entities.removeAll();
    this.handles = [];
    this.sceneHandles.clear();
  }

  /** Zoom-aware cap for the current camera altitude. */
  currentPolityCap(): number {
    return polityCapForHeight(this.cameraHeight());
  }

  /** Which geometry tier the current camera altitude calls for. */
  polityTier(): 'lod' | 'full' {
    return this.cameraHeight() > POLITY_LOD_HEIGHT ? 'lod' : 'full';
  }

  cameraHeight(): number {
    const viewer = this.viewer;
    if (!viewer) return INITIAL_VIEW.height;
    const carto = viewer.camera.positionCartographic;
    return carto?.height ?? INITIAL_VIEW.height;
  }

  /** Visible lon/lat rectangle, used for viewport culling. */
  visibleRect(): { west: number; south: number; east: number; north: number } | null {
    const viewer = this.viewer;
    if (!viewer) return null;
    const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rect) return null;
    const toDeg = Cesium.Math.toDegrees;
    return {
      west: toDeg(rect.west),
      south: toDeg(rect.south),
      east: toDeg(rect.east),
      north: toDeg(rect.north),
    };
  }

  /* ── modern borders ──────────────────────────────────────────────────── */

  async loadModernBorders(countriesUrl: string, bordersUrl: string): Promise<boolean> {
    const viewer = this.viewer;
    if (!viewer) return false;

    /*
     * Modern borders used to be `--rule-3` (#a89f8d) at 1 px, which is almost
     * exactly the value of the toned-down OSM basemap underneath — so the layer
     * was on but invisible. A darker stroke at 2 px reads on both basemaps;
     * Cesium draws polyline width as a screen-space ribbon, so 2 px survives.
     */
    const stroke = Cesium.Color.fromCssColorString(css('--ink-2', '#4c4f56')).withAlpha(0.85);

    if (!this.countriesDS) {
      try {
        /*
         * Natural Earth's Antarctica ring closes along the pole with a single
         * edge from (-180, -90) to (180, -90). Cesium subdivides that edge as a
         * 360-degree rhumb line: the task either explodes into a gigantic
         * vertex buffer or never returns, and because the geometry workers are
         * a shared FIFO queue it also starves every other async primitive —
         * the polity layer then sits in CREATING forever and draws nothing.
         *
         * The reference layer exists to show coastlines, so the polar ring is
         * cleaned before Cesium ever sees it.
         */
        const source = await Cesium.GeoJsonDataSource.load(
          await sanitizeCountries(countriesUrl),
          {
            fill: Cesium.Color.TRANSPARENT,
            stroke,
            strokeWidth: 2,
          },
        );
        if (this.abort.signal.aborted) return false;
        viewer.dataSources.add(source);
        // Reflect the switch as it stands now, not a hard-coded false.
        source.show = this.bordersWanted;
        this.countriesDS = source;
      } catch {
        this.countriesDS = null;
      }
    }

    if (!this.bordersDS) {
      try {
        const source = await Cesium.GeoJsonDataSource.load(bordersUrl, {
          stroke,
          strokeWidth: 2,
          clampToGround: false,
        });
        if (this.abort.signal.aborted) return false;
        viewer.dataSources.add(source);
        source.show = this.bordersWanted;
        this.bordersDS = source;
      } catch {
        this.bordersDS = null;
      }
    }

    /*
     * The caller uses this to decide whether to retry. Reporting success only
     * when both sources are attached is what stops a failed first attempt from
     * leaving the switch permanently dead: previously the flag was set before
     * the await and never cleared, so every later toggle short-circuited.
     */
    return Boolean(this.countriesDS && this.bordersDS);
  }

  setModernBordersVisible(visible: boolean) {
    this.bordersWanted = visible;
    const viewer = this.viewer;
    if (!viewer) return;
    for (const source of [this.countriesDS, this.bordersDS]) {
      if (!source) continue;
      // A source can outlive its registration; re-adding costs far less than
      // silently showing nothing.
      if (!viewer.dataSources.contains(source)) viewer.dataSources.add(source);
      source.show = visible;
    }
  }

  /* ── camera ──────────────────────────────────────────────────────────── */

  flyTo(lon: number, lat: number, height = 1_800_000, duration = 1.4) {
    const viewer = this.viewer;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      duration,
    });
  }

  resetView() {
    const viewer = this.viewer;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        INITIAL_VIEW.lon,
        INITIAL_VIEW.lat,
        INITIAL_VIEW.height,
      ),
      duration: 1.4,
    });
  }

  refreshImageryTuning() {
    if (!this.imagery) return;
    if (this.base !== 'standard') return;
    this.imagery.brightness = Number(css('--imagery-brightness', '1.06'));
    this.imagery.saturation = Number(css('--imagery-saturation', '0.34'));
    this.imagery.contrast = Number(css('--imagery-contrast', '0.94'));
    this.imagery.gamma = Number(css('--imagery-gamma', '1.02'));
  }

  get loadedEventCount() {
    return this.eventIndex.length;
  }
}

export const globe = new GlobeEngine();

/*
 * Dev-only handle for browser-side debugging of the layer pipeline. Kept in a
 * DEV guard so nothing leaks into the production bundle.
 */
if (import.meta.env.DEV) {
  (window as unknown as { __globe?: GlobeEngine }).__globe = globe;
}

/* ── reference GeoJSON repair ────────────────────────────────────────────── */

/** Latitude the polar rings are clamped to, a hair away from the singularity. */
const POLAR_LAT = 89.5;
/** Longest edge (in degrees) a ring may keep after clamping. */
const MAX_LON_STEP = 30;

type GeoJsonGeometry = { type: string; coordinates: unknown };

/**
 * Rewrites a ring so no edge can blow up Cesium's subdivision count.
 *
 * Two changes: latitudes are clamped away from the poles (a vertex exactly on
 * the pole makes the rhumb-line surface distance undefined), and any edge that
 * still spans more than `MAX_LON_STEP` degrees is split by interpolated
 * vertices — which is what keeps Antarctica's 360-degree closing edge cheap.
 */
function clampPolarRing(ring: number[][]): number[][] {
  const out: number[][] = [];
  for (const point of ring) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const lon = point[0];
    const lat = Math.max(-POLAR_LAT, Math.min(POLAR_LAT, point[1]));
    const prev = out[out.length - 1];
    if (prev) {
      const dLon = lon - prev[0];
      if (Math.abs(dLon) > MAX_LON_STEP) {
        const steps = Math.ceil(Math.abs(dLon) / MAX_LON_STEP);
        for (let i = 1; i < steps; i += 1) {
          const t = i / steps;
          out.push([prev[0] + dLon * t, prev[1] + (lat - prev[1]) * t]);
        }
      }
      if (prev[0] === lon && prev[1] === lat) continue;
    }
    out.push([lon, lat]);
  }
  return out;
}

function clampPolarGeometry(geometry: GeoJsonGeometry | null | undefined) {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: (geometry.coordinates as number[][][]).map(clampPolarRing),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: (geometry.coordinates as number[][][][]).map((polygon) =>
        polygon.map(clampPolarRing),
      ),
    };
  }
  return geometry;
}

/**
 * Reference layers are third-party Natural Earth files, so the repair happens
 * here rather than in the shipped data — a future download stays compatible.
 */
async function sanitizeCountries(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const json = (await res.json()) as {
    features?: Array<{ geometry?: GeoJsonGeometry | null }>;
  };
  return {
    ...json,
    features: (json.features ?? []).map((feature) => ({
      ...feature,
      geometry: clampPolarGeometry(feature.geometry),
    })),
  };
}

/**
 * Shoelace area of a ring in square degrees.
 *
 * Only used to rank polygon parts of one feature against each other, so the
 * distortion of treating degrees as planar cancels out.
 */
function ringArea(ring: number[][] | undefined): number {
  if (!ring || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum) / 2;
}

/**
 * How many polygon parts of a single feature may be drawn.
 *
 * This exists only as a frame-time guard for pathological features; it is set
 * high enough that the largest composite polity in the dataset (170 parts)
 * renders in full at the default zoom.
 */
function polityPartBudget(height: number): number {
  if (height > 16_000_000) return 260;
  if (height > 8_000_000) return 600;
  if (height > 3_000_000) return 1200;
  return 3000;
}

/** Prepare a raw feature with a cached bbox, once per file load. */
export function prepareFeature(feature: PolityFeature): PreparedPolity | null {
  const rings: number[][][] =
    feature.geometry.type === 'Polygon'
      ? (feature.geometry.coordinates as number[][][])
      : (feature.geometry.coordinates as number[][][][]).flat(1);

  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      const lon = point[0];
      const lat = point[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  if (!Number.isFinite(w)) return null;

  return {
    feature,
    bbox: [w, s, e, n],
    name: feature.properties?.Name ?? '',
    fromYear: feature.properties?.FromYear ?? Number.NEGATIVE_INFINITY,
    toYear: feature.properties?.ToYear ?? Number.POSITIVE_INFINITY,
    area: feature.properties?.Area ?? 0,
  };
}

export function filterPolities(
  prepared: PreparedPolity[],
  year: number,
  rect: { west: number; south: number; east: number; north: number } | null,
  cap: number,
): { shown: PreparedPolity[]; matched: number } {
  const active = prepared.filter((p) => year >= p.fromYear && year <= p.toYear);
  const inView = rect ? active.filter((p) => bboxIntersects(p.bbox, rect)) : active;
  const pool = inView.length > 0 ? inView : active;

  const sorted = [...pool].sort((a, b) => b.area - a.area);
  return { shown: sorted.slice(0, cap), matched: active.length };
}
