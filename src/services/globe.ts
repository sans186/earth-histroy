import * as Cesium from 'cesium';
import type { Feature, FeatureCollection } from 'geojson';
import {
  BASEMAPS,
  BOUNDARY_ALTITUDE,
  INITIAL_VIEW,
  MAX_ZOOM_DISTANCE,
  POLITY_LOD_HEIGHT,
  polityCapForHeight,
} from '@/config';
import { bboxIntersects } from '@/lib/geo';
import { formatYearCompact } from '@/lib/format';
import { neutralizeModernBoundaries, normalizeModernCountries } from '@/lib/modernBorders';
import { labelAnchor } from '@/lib/polityScope';
import type { TrailNode, TrailScene } from '@/lib/trajectory';
import { fetchJson } from '@/services/http';
import type { StoryStep } from '@/types/story';
import type { Locale, PolityFeature, PreparedPolity, TimelineEvent } from '@/types';

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

/**
 * Render scale while the camera is moving.
 *
 * Dragging re-draws the whole scene every frame, and at a 2x device pixel ratio
 * that is four times the pixels of a CSS-resolution frame. Dropping to 70% for
 * the duration of the gesture is the usual trade: the picture is briefly soft
 * while moving and snaps back to full detail on pointer-up.
 */
const INTERACTIVE_SCALE = 0.7;

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

/** Smooth start-and-stop easing for the story route growth. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Initial great-circle bearing from one step to the next, in degrees 0–360. */
function initialBearing(from: StoryStep, to: StoryStep): number {
  const lat1 = Cesium.Math.toRadians(from.lat);
  const lat2 = Cesium.Math.toRadians(to.lat);
  const dLon = Cesium.Math.toRadians(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Cesium.Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
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
 * Wars are drawn as solid, outlined diamonds rather than dots, so they read as
 * a different kind of thing from the round event markers without needing a
 * legend entry to explain them. The light rim keeps the silhouette crisp against
 * dark imagery, and the soft drop shadow lifts the marker off the paper map.
 */
function diamondTexture(fill: string, stroke: string, size = 32): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Leave room inside the bitmap for the outline and the shadow blur.
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

  if (fill !== 'none') {
    ctx.save();
    ctx.shadowColor = 'rgba(18, 20, 24, 0.42)';
    ctx.shadowBlur = size / 9;
    ctx.shadowOffsetY = size / 18;
    outline();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  outline();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, size / 12);
  ctx.lineJoin = 'miter';
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

  /** Entities of the open person's route; empty whenever no person is open. */
  private trajectory: Cesium.Entity[] = [];
  /** Stop record per trail entity id, so a click can open its account card. */
  private trailNodeIndex = new Map<string, TrailNode>();
  private trailPopup: HTMLDivElement | null = null;
  private trailPopupAnchor: Cesium.Cartesian3 | null = null;
  /** `postRender` listener that keeps the open card on its stop as the camera moves. */
  private trailPopupTick: (() => void) | null = null;
  private trailLocale: Locale = 'zh';

  /** Entities of the story step's region highlight; removed together on clear. */
  private storyRegionEntities: Cesium.Entity[] = [];

  /** Cancels the in-flight story route transition, if any. */
  private storyRouteCancel: (() => void) | null = null;

  private polityLayer = new Cesium.CustomDataSource('polities');
  /** Name entities of the last render, so the layer switch avoids a redraw. */
  private polityLabels: Cesium.Entity[] = [];
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
  /** True between camera `moveStart` and `moveEnd`, i.e. during a drag or zoom. */
  private interacting = false;
  /** Pending "camera settled" callback, coalesced across one gesture. */
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

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
    /*
     * Multi-sample anti-aliasing is the most expensive default left on this
     * canvas: the map is mostly flat fills and thin outlines, so the extra
     * samples cost fill rate without changing what the reader sees.
     */
    scene.msaaSamples = 1;
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

    viewer.camera.moveStart.addEventListener(() => {
      this.cancelSettle();
      this.beginInteraction();
    });
    viewer.camera.moveEnd.addEventListener(() => {
      this.endInteraction();
      this.scheduleSettle();
    });

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

  /**
   * Cheapen the frames that are drawn while the camera moves.
   *
   * Two things made dragging stutter. Every camera change redraws the whole
   * scene, and the hover pipeline drew it a *second* time into the pick buffer
   * roughly twelve times a second — the pointer is always moving during a drag,
   * so the 80 ms hover throttle never got a chance to idle. Skipping the pick
   * and dropping the render scale for the duration of the gesture fixes both.
   */
  private beginInteraction() {
    const viewer = this.viewer;
    if (!viewer) return;
    this.interacting = true;
    if (viewer.resolutionScale !== INTERACTIVE_SCALE) {
      viewer.resolutionScale = INTERACTIVE_SCALE;
    }
    // A tooltip resolved mid-drag would describe a place the camera has already
    // left, so clear it instead of letting it lag behind.
    this.callbacks.onHoverEvent?.(null);
    this.callbacks.onHoverPolity?.(null);
    viewer.scene.canvas.style.cursor = 'default';
    this.clearHighlight();
    this.hovered = null;
  }

  private endInteraction() {
    const viewer = this.viewer;
    if (!viewer) return;
    this.interacting = false;
    if (viewer.resolutionScale !== 1) viewer.resolutionScale = 1;
  }

  /**
   * Coalesces the "camera settled" signal.
   *
   * `moveEnd` fires at every pause inside one gesture — a drag with a little
   * inertia produces several, and each one used to walk the whole polity set
   * again and rebuild every polygon entity. That rebuild is the stutter at the
   * end of a drag, so it now runs once, after the camera has actually stopped.
   */
  private scheduleSettle() {
    this.cancelSettle();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.callbacks.onViewChange?.();
    }, 260);
  }

  private cancelSettle() {
    if (!this.settleTimer) return;
    clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  destroy(): void {
    this.abort.abort();
    this.cancelSettle();
    this.cancelStoryRoute();
    for (const h of this.handlers) {
      if (!h.isDestroyed()) h.destroy();
    }
    this.handlers = [];
    this.handles = [];
    this.sceneHandles.clear();
    this.hovered = null;
    this.storyRegionEntities = [];
    this.removeTrailPopup();
    this.trajectory = [];
    this.trailNodeIndex.clear();
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

    const base = BASEMAPS[kind];
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: base.url,
      credit: base.attribution,
      maximumLevel: base.maxzoom,
    });

    const layer = viewer.imageryLayers.addImageryProvider(provider);
    // The standard basemap is toned down towards paper; satellite keeps more body.
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
    // Polities are tinted on paper and boundary-only over imagery, so a switch
    // has to restyle whatever is already on the globe.
    this.restylePolities();
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
        // The open route owns the click, exactly as on the flat map.
        const stop = this.trailNodeFromPick(pick);
        if (stop) {
          this.showTrailPopup(stop, movement.position);
          return;
        }
        // Any other target dismisses the open account card.
        this.removeTrailPopup();
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
      this.removeTrailPopup();
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
      // No hover work while the camera moves: a pick is an extra full render of
      // a scene that is already being redrawn every frame.
      if (this.interacting) return;
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

  /**
   * A trail stop, resolved by entity id.
   *
   * The stop's record lives in a side table rather than on the entity: Cesium
   * only hands back the entity from the pick buffer, and a map lookup is cheaper
   * than custom properties the entity machinery would clone per frame.
   */
  private trailNodeFromPick(pick: PickResult | undefined): TrailNode | null {
    const hit = (pick as { id?: unknown } | undefined)?.id;
    const key = hit instanceof Cesium.Entity ? String(hit.id) : hit;
    if (typeof key !== 'string') return null;
    return this.trailNodeIndex.get(key) ?? null;
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
    // A frame queued by requestAnimationFrame can land after the drag began.
    if (this.interacting) return;

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

    const stop = this.trailNodeFromPick(pick);
    const event = stop ? null : this.eventFromPick(pick);
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
      viewer.scene.canvas.style.cursor = stop || polity || warId ? 'pointer' : 'default';
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
    const polygon = entity.polygon;
    if (!polygon) return;
    const accent = Cesium.Color.fromCssColorString(css('--accent', '#b0522d')).withAlpha(0.95);
    /*
     * Boundary-only polities have no wash to brighten, so their hover cue has to
     * live on the outline: it switches to a lifted red instead. That is the only
     * lever a 1 px Cesium polygon outline offers, but against a rust red line
     * the change still reads as "this one, right here".
     */
    const borderOnly = handle.fill.alpha === 0;
    if (!borderOnly) {
      polygon.material = new Cesium.ColorMaterialProperty(
        handle.fill.withAlpha(Math.min(1, handle.fill.alpha + 0.32)),
      );
    }
    polygon.outlineColor = new Cesium.ConstantProperty(
      borderOnly ? accent.brighten(0.55, new Cesium.Color()).withAlpha(1) : accent,
    );
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

  /* ── person trajectory ────────────────────────────────────────────────── */

  /**
   * The path of one life, drawn only while that person's card is open.
   *
   * The model has already applied the time cursor, so a leg that started before
   * the cursor and ends after it arrives shortened. Colour and node size travel
   * on each item, which is what lets a single life ramp from early to late and a
   * comparison give each person their own colour.
   */
  renderTrajectory(scene: TrailScene | null, locale: Locale = 'zh') {
    this.trailLocale = locale;
    const viewer = this.viewer;
    if (!viewer) return;
    this.clearTrajectory();
    if (!scene) return;

    const paper = Cesium.Color.fromCssColorString(css('--paper', '#f7f5f0'));

    for (const segment of scene.segments) {
      const color = Cesium.Color.fromCssColorString(segment.color).withAlpha(0.85);
      this.trajectory.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              segment.coords[0][0],
              segment.coords[0][1],
              BOUNDARY_ALTITUDE,
              segment.coords[1][0],
              segment.coords[1][1],
              BOUNDARY_ALTITUDE,
            ]),
            width: 2.4,
            material: new Cesium.PolylineGlowMaterialProperty({
              color,
              glowPower: 0.1,
            }),
            /*
             * Not clamped to the ground: at grazing angles a clamped line is
             * hidden by the polity fills and the imagery, which is the same trap
             * the historical borders fell into.
             */
            clampToGround: false,
          },
        }),
      );
    }

    for (const node of scene.nodes) {
      const id = `trail:${node.personId}:${node.index}:${node.year}`;
      this.trailNodeIndex.set(id, node);
      this.trajectory.push(
        viewer.entities.add({
          id,
          position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, BOUNDARY_ALTITUDE),
          point: {
            pixelSize: Math.round(node.radius * 1.2),
            color: Cesium.Color.fromCssColorString(node.color),
            // Heavier rim than an event dot, so a station never reads as one.
            outlineColor: paper,
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }

    for (const head of scene.heads) {
      const color = Cesium.Color.fromCssColorString(head.color);
      this.trajectory.push(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(head.lon, head.lat, BOUNDARY_ALTITUDE),
          point: {
            pixelSize: 14,
            color: color.withAlpha(0.28),
            outlineColor: color,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
  }

  clearTrajectory() {
    this.removeTrailPopup();
    this.trailNodeIndex.clear();
    const viewer = this.viewer;
    if (!viewer) return;
    for (const entity of this.trajectory) viewer.entities.remove(entity);
    this.trajectory = [];
  }

  /**
   * The account card for a clicked stop.
   *
   * A DOM node over the canvas rather than a Cesium `InfoBox`: the viewer runs
   * without one, and this card has to look like the flat map's popup and the
   * lifeline's tooltip. `postRender` re-projects the stop every frame, so the
   * card stays pinned to it while the camera turns.
   */
  private showTrailPopup(node: TrailNode, screen?: Cesium.Cartesian2) {
    const viewer = this.viewer;
    if (!viewer) return;
    this.removeTrailPopup();

    const en = this.trailLocale === 'en';
    const who = en ? node.personNameEn || node.personName : node.personName;
    const place = en ? node.placeEn || node.place : node.place;
    const title = en ? node.titleEn || node.title : node.title;
    const from = formatYearCompact(node.year, this.trailLocale);
    const years =
      node.yearEnd === node.year ? from : `${from} – ${formatYearCompact(node.yearEnd, this.trailLocale)}`;
    const span = Math.max(0, node.yearEnd - node.year);
    const meta = span > 0 ? `${years} · ${en ? `${span} yr` : `停留 ${span} 年`}` : years;

    const card = document.createElement('div');
    card.className = 'globe-trail-popup';
    card.style.cssText = [
      'position:absolute',
      'transform:translate(-50%,-100%)',
      'z-index:6',
      'max-width:270px',
      'padding:8px 26px 9px 10px',
      'background:var(--card,#fdfcf9)',
      'border:1px solid var(--rule-2,#cfc6b4)',
      'box-shadow:0 8px 22px rgba(20,20,20,.18)',
      'font-size:12px',
      'line-height:1.55',
      'color:var(--ink-2,#3f4145)',
    ].join(';');

    const line = (text: string | undefined, style: string) => {
      if (!text) return;
      const el = document.createElement('div');
      el.style.cssText = style;
      el.textContent = text;
      card.append(el);
    };
    line(meta, 'font-size:11px;letter-spacing:.05em;color:#8a7a5c');
    line(who, `font-size:11px;margin-top:2px;color:${node.color}`);
    line(place, 'font-weight:600;font-size:13px;margin:2px 0 3px;color:var(--ink,#1a1c20)');
    line(title, 'color:#63666b');

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', en ? 'Close' : '关闭');
    close.style.cssText =
      'position:absolute;top:2px;right:4px;padding:0 4px;font-size:15px;line-height:1.4;color:#8a7a5c;background:transparent;border:0;cursor:pointer';
    close.addEventListener('click', () => this.removeTrailPopup());
    card.append(close);

    viewer.container.append(card);
    this.trailPopup = card;
    this.trailPopupAnchor = Cesium.Cartesian3.fromDegrees(node.lon, node.lat, BOUNDARY_ALTITUDE);
    this.positionTrailPopup(screen);

    const tick = () => this.positionTrailPopup();
    this.trailPopupTick = tick;
    viewer.scene.postRender.addEventListener(tick);
  }

  private positionTrailPopup(fallback?: Cesium.Cartesian2) {
    const card = this.trailPopup;
    if (!card) return;
    const viewer = this.viewer;
    const at =
      viewer && this.trailPopupAnchor
        ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, this.trailPopupAnchor)
        : fallback;
    if (!at) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    card.style.left = `${Math.round(at.x)}px`;
    card.style.top = `${Math.round(at.y - 14)}px`;
  }

  private removeTrailPopup() {
    const viewer = this.viewer;
    if (this.trailPopupTick && viewer && !viewer.isDestroyed()) {
      viewer.scene.postRender.removeEventListener(this.trailPopupTick);
    }
    this.trailPopupTick = null;
    this.trailPopup?.remove();
    this.trailPopup = null;
    this.trailPopupAnchor = null;
  }

  /**
   * Frame the walked ground. Heights are a rough fit: a life that crossed an
   * ocean needs a globe-wide view, one that stayed in a city needs a regional one.
   */
  fitTrail(bounds: [[number, number], [number, number]]) {
    const [[west, south], [east, north]] = bounds;
    const lon = (west + east) / 2;
    const lat = (south + north) / 2;
    const span = Math.max(6, Math.abs(east - west), Math.abs(north - south));
    const height = Math.min(12_000_000, Math.max(700_000, span * 111_000 * 2.4));
    this.flyTo(lon, lat, height);
  }

  /* ── story region ─────────────────────────────────────────────────────── */

  /**
   * Highlight the region the current story step is talking about.
   *
   * A step may carry an explicit polygon (`region`) or just a centre and a
   * radius; with neither it falls back to a circle 260 km across, so every
   * step still leaves a visible footprint. The polygon, marker point and name
   * label are all kept in one list so a step change can tear them down in a
   * single pass.
   */
  showStoryRegion(step: StoryStep) {
    const viewer = this.viewer;
    if (!viewer) return;
    this.clearStoryRegion();

    const warm = Cesium.Color.fromCssColorString('#c0392b');
    const ring = closedRing(
      step.region && step.region.length >= 3
        ? step.region
        : circleRing(step.lon, step.lat, (step.radiusKm ?? 260) * STORY_RADIUS_SCALE),
    );

    const flat: number[] = [];
    for (const [lon, lat] of ring) flat.push(lon, lat);
    this.storyRegionEntities.push(
      viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
          material: new Cesium.ColorMaterialProperty(warm.withAlpha(0.16)),
          outline: true,
          outlineColor: new Cesium.ConstantProperty(warm.withAlpha(0.75)),
          outlineWidth: 2,
          height: 0,
          perPositionHeight: false,
          arcType: Cesium.ArcType.GEODESIC,
        },
      }),
    );

    const position = Cesium.Cartesian3.fromDegrees(step.lon, step.lat, BOUNDARY_ALTITUDE);
    this.storyRegionEntities.push(
      viewer.entities.add({
        position,
        point: {
          pixelSize: 8,
          color: warm,
          outlineColor: Cesium.Color.fromCssColorString('#f7f5f0'),
          outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );

    this.storyRegionEntities.push(
      viewer.entities.add({
        position,
        label: {
          text: step.regionLabel ?? step.title,
          font: '600 12px "Noto Sans SC", "PingFang SC", system-ui, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#1a1c20'),
          outlineColor: Cesium.Color.fromCssColorString('#f7f5f0').withAlpha(0.9),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#f7f5f0').withAlpha(0.6),
          backgroundPadding: new Cesium.Cartesian2(5, 3),
          pixelOffset: new Cesium.Cartesian2(0, -18),
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
  }

  clearStoryRegion() {
    const viewer = this.viewer;
    if (viewer) {
      for (const entity of this.storyRegionEntities) viewer.entities.remove(entity);
    }
    this.storyRegionEntities = [];
  }

  /* ── story route transition ──────────────────────────────────────────── */

  /**
   * Animate a route growing from one story step to the next, then push the
   * camera in on the destination.
   *
   * The camera first frames the whole leg with a bounding sphere — rotated to
   * the leg's bearing so a long crossing runs across the screen — then a
   * two-layer glowing line grows along the great circle, arcing to the leg's own
   * scale, and the camera finishes on the destination. Resolves when the leg
   * finishes, and on any cancellation or error, so a closed story never stalls.
   */
  animateStoryRoute(
    from: StoryStep,
    to: StoryStep,
    mode: 'land' | 'air' | 'sea',
    durationMs = 2400,
  ): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return Promise.resolve();
    // A new leg (or a close) supersedes whichever one is already in flight.
    this.cancelStoryRoute();

    let positions: Cesium.Cartesian3[];
    let profile: {
      sphere: Cesium.BoundingSphere;
      range: number;
      heading: number;
      pitch: number;
      d: number;
      arc: number;
    };
    let color: Cesium.Color;
    let paper: Cesium.Color;

    try {
      profile = this.storyCameraProfile(from, to, mode);
      positions = this.sampleStoryRoute(from, to, mode);
      const isLand = mode === 'land';
      color = Cesium.Color.fromCssColorString(isLand ? '#c0392b' : '#2e86c1');
      paper = Cesium.Color.fromCssColorString(css('--paper', '#f7f5f0'));
    } catch {
      // A malformed leg must never stall the player: treat it as "already done".
      return Promise.resolve();
    }

    // Close in proportionally to the leg, so a short hop is not shot from orbit.
    const destinationHeight = to.height ?? clamp(profile.d * 0.8 + 50_000, 80_000, 1_200_000);

    return new Promise<void>((resolve) => {
      let done = false;
      let rafId = 0;
      let entities: Cesium.Entity[] = [];
      /** Already-eased 0–1 growth, read by the line and head CallbackProperties. */
      let progress = 0;

      const growCount = () =>
        Math.max(2, Math.min(positions.length, Math.ceil(progress * positions.length)));

      const positionsProp = new Cesium.CallbackProperty(
        () => positions.slice(0, growCount()),
        false,
      );
      const headProp = new Cesium.CallbackPositionProperty(
        () => positions[growCount() - 1],
        false,
      );

      const cleanup = () => {
        cancelAnimationFrame(rafId);
        // Abort whichever scripted camera move is still running.
        if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
        for (const entity of entities) viewer.entities.remove(entity);
        entities = [];
      };

      const settle = () => {
        if (done) return;
        done = true;
        if (this.storyRouteCancel === cancel) this.storyRouteCancel = null;
        cleanup();
        resolve();
      };

      const cancel = () => settle();

      this.storyRouteCancel = cancel;

      // A leg shorter than this has no arc worth drawing; just land on it.
      if (profile.d < 3_000) {
        this.flyTo(to.lon, to.lat, destinationHeight, 1.2).then(() => settle());
        return;
      }

      // Frame the whole leg first, looking along the leg's bearing.
      new Promise<boolean>((res) => {
        viewer.camera.flyToBoundingSphere(profile.sphere, {
          offset: new Cesium.HeadingPitchRange(profile.heading, profile.pitch, profile.range),
          duration: 1.1,
          easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
          complete: () => res(true),
          cancel: () => res(false),
        });
      })
        .then(() => {
          if (done) return;

          try {
            entities = [
              viewer.entities.add({
                polyline: {
                  positions: positionsProp,
                  width: 14,
                  material: new Cesium.ColorMaterialProperty(color.withAlpha(0.16)),
                  clampToGround: false,
                },
              }),
              viewer.entities.add({
                polyline: {
                  positions: positionsProp,
                  width: 4,
                  material: new Cesium.PolylineGlowMaterialProperty({ color, glowPower: 0.35 }),
                  clampToGround: false,
                },
              }),
              viewer.entities.add({
                position: headProp,
                point: {
                  pixelSize: 9,
                  color,
                  outlineColor: paper,
                  outlineWidth: 2,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
              }),
            ];
          } catch {
            settle();
            return;
          }

          const t0 = performance.now();
          const frame = (now: number) => {
            if (done) return;
            // With `requestRenderMode` the render loop does not run on its own;
            // nudge it every frame so the growing line actually appears.
            viewer.scene.requestRender();
            const t = Math.min(1, (now - t0) / durationMs);
            progress = easeInOutCubic(t);
            if (t < 1) {
              rafId = requestAnimationFrame(frame);
              return;
            }
            progress = 1;
            viewer.scene.requestRender();
            // Leg drawn: push in on the destination, then tear the line down.
            this.flyTo(to.lon, to.lat, destinationHeight, 1.2).then(() => settle());
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

  /**
   * Peak height of a route's arc, in metres, for a leg `d` metres long.
   *
   * Proportional to distance, with floors and ceilings that keep a short hop
   * visible and a cross-ocean flight from leaving the atmosphere.
   */
  private storyArcHeight(d: number, mode: 'land' | 'air' | 'sea'): number {
    if (mode === 'land') return clamp(d * 0.06, 1_500, 120_000);
    if (mode === 'sea') return clamp(d * 0.12, 4_000, 6_000_000);
    return clamp(d * 0.15, 5_000, 8_000_000);
  }

  /**
   * The camera framing for a leg: a sphere enclosing both ends and the arc's
   * apex, plus the heading/pitch/range that keeps the whole route on screen.
   */
  private storyCameraProfile(
    from: StoryStep,
    to: StoryStep,
    mode: 'land' | 'air' | 'sea',
  ): {
    sphere: Cesium.BoundingSphere;
    range: number;
    heading: number;
    pitch: number;
    d: number;
    arc: number;
  } {
    const start = Cesium.Cartographic.fromDegrees(from.lon, from.lat);
    const end = Cesium.Cartographic.fromDegrees(to.lon, to.lat);
    const geodesic = new Cesium.EllipsoidGeodesic(start, end);
    const d = geodesic.surfaceDistance;
    const arc = this.storyArcHeight(d, mode);

    const mid = geodesic.interpolateUsingFraction(0.5, new Cesium.Cartographic());
    const p1 = Cesium.Cartesian3.fromDegrees(from.lon, from.lat, 0);
    const p2 = Cesium.Cartesian3.fromDegrees(to.lon, to.lat, 0);
    const apex = Cesium.Cartesian3.fromRadians(mid.longitude, mid.latitude, arc);
    const sphere = Cesium.BoundingSphere.fromPoints([p1, apex, p2]);

    let range = Math.max(sphere.radius * 3.0, 30_000);
    // Head across the route rather than always looking north up the screen.
    let heading = Cesium.Math.toRadians((initialBearing(from, to) - 90 + 360) % 360);

    // Steeper for short legs, shallower for long ones where the horizon matters.
    let pitchDeg: number;
    if (d < 50_000) pitchDeg = -62;
    else if (d < 300_000) pitchDeg = -56;
    else if (d < 2_000_000) pitchDeg = -50;
    else pitchDeg = -45;

    // A step may nudge its own arrival framing; absent, the defaults stand.
    const view = to.view;
    if (view?.pitch !== undefined) pitchDeg = view.pitch;
    if (view?.headingOffset) heading += Cesium.Math.toRadians(view.headingOffset);
    if (view?.rangeScale) range *= view.rangeScale;

    return { sphere, range, heading, pitch: Cesium.Math.toRadians(pitchDeg), d, arc };
  }

  /**
   * 128 points along the great circle between two steps, lifted onto the arc
   * that `storyArcHeight` scales to the leg.
   */
  private sampleStoryRoute(
    from: StoryStep,
    to: StoryStep,
    mode: 'land' | 'air' | 'sea',
  ): Cesium.Cartesian3[] {
    const start = Cesium.Cartographic.fromDegrees(from.lon, from.lat);
    const end = Cesium.Cartographic.fromDegrees(to.lon, to.lat);
    const geodesic = new Cesium.EllipsoidGeodesic(start, end);
    const arc = this.storyArcHeight(geodesic.surfaceDistance, mode);

    const N = 128;
    const positions: Cesium.Cartesian3[] = [];
    const carto = new Cesium.Cartographic();
    for (let i = 0; i < N; i += 1) {
      const fraction = i / (N - 1);
      geodesic.interpolateUsingFraction(fraction, carto);
      // A half-sine hump: zero at both ends, the peak at the midpoint.
      const height = arc * Math.sin(Math.PI * fraction);
      positions.push(Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, height));
    }
    return positions;
  }

  /* ── wars ────────────────────────────────────────────────────────────── */

  /**
   * One diamond per war theatre. Every marker is a solid ink diamond with a pale
   * rim; the selected war swaps to the rust accent and grows slightly so it
   * stays findable among a few hundred others.
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
        idle: diamondTexture(css('--ink', '#1a1c20'), css('--paper', '#f7f5f0')),
        active: diamondTexture(css('--rust', '#b0522d'), css('--paper', '#f7f5f0')),
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
        width: isActive ? 34 : 22,
        height: isActive ? 34 : 22,
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
          // Clears the diamond itself, which grew from 18px to 22px.
          pixelOffset: new Cesium.Cartesian2(0, -22),
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
   * Fill and outline for one polity — both depend on the basemap.
   *
   * On the toned-down paper basemap the tinted wash is what separates a polity
   * from its neighbours: a single-pixel outline nearly disappears against it.
   * Satellite imagery already carries its own colour and texture, so a wash on
   * top of it just hazes over the terrain the basemap is there to show — there
   * the polity is its boundary only, drawn in the rust accent as a red line.
   */
  private polityStyle(name: string): { fill: Cesium.Color; stroke: Cesium.Color } {
    if (this.base === 'satellite') {
      const red = Cesium.Color.fromCssColorString(css('--rust', '#b0522d'));
      // Alpha 0 rather than a missing material: the fill has to stay pickable so
      // hovering the interior still raises the hover card.
      return { fill: red.withAlpha(0), stroke: red.withAlpha(0.92) };
    }
    return {
      fill: Cesium.Color.fromCssColorString(
        css(PALETTE[hashString(name) % PALETTE.length], '#26406b'),
      ).withAlpha(0.42),
      stroke: Cesium.Color.fromCssColorString(css('--rule-3', '#a89f8d')).withAlpha(0.85),
    };
  }

  /**
   * Re-apply polity styling after a basemap switch.
   *
   * Only the material and the outline change, so nothing has to be re-picked or
   * re-culled: colour is a rendering concern, not a data one.
   */
  private restylePolities() {
    for (const handle of this.handles) {
      const style = this.polityStyle(handle.feature.properties?.Name ?? '');
      handle.fill = style.fill;
      handle.stroke = style.stroke;
      const polygon = handle.entity.polygon;
      if (!polygon) continue;
      polygon.material = new Cesium.ColorMaterialProperty(style.fill);
      polygon.outlineColor = new Cesium.ConstantProperty(style.stroke);
    }
    // The loop above just reset the hovered entity to its resting style.
    if (this.hovered) this.applyHighlight(this.hovered);
  }

  /**
   * Render the polities active in `year`.
   *
   * Two behaviours differ from the previous implementation on purpose:
   *   1. no flat 800-feature truncation — the cap scales with camera altitude,
   *      and the layer reports how many were withheld instead of dropping them
   *      silently;
   *   2. boundaries are the polygon outline itself, so they can never be
   *      occluded by the surface the way a ground-hugging polyline was;
   *   3. styling comes from `polityStyle`, which drops the fill entirely over
   *      satellite imagery and leaves only the red boundary.
   */
  renderPolities(
    features: PolityFeature[],
    names: Record<string, string>,
    opts: { labels?: boolean; locale?: Locale } = {},
  ) {
    const viewer = this.viewer;
    if (!viewer) return;

    /*
     * Names on the globe.
     *
     * Cesium has no collision engine for labels, so importance is decided up
     * front: only the largest polities by area get a name, and the distance at
     * which each name survives is tied to that rank. Pulling the camera in adds
     * names the way a paper atlas does, with no per-frame layout pass.
     */
    const labelTiers = new Map<string, number>();
    features
      .map((feature) => ({ feature, area: Number(feature.properties?.Area) || 0 }))
      .sort((a, b) => b.area - a.area)
      .slice(0, 80)
      .forEach((item, index) => {
        const props = item.feature.properties ?? {};
        labelTiers.set(
          `${props.Name ?? ''}|${props.FromYear ?? ''}|${props.ToYear ?? ''}`,
          index < 12 ? 2 : index < 30 ? 1 : 0,
        );
      });
    const locale: Locale = opts.locale ?? 'zh';
    const labelsOn = opts.labels !== false;

    this.clearHighlight();
    this.hovered = null;
    const entities = this.renewPolityLayer(viewer).entities;
    this.handles = [];
    this.sceneHandles.clear();
    this.polityLabels = [];

    entities.suspendEvents();
    let withheldParts = 0;

    try {
      for (const feature of features) {
        const props = feature.properties ?? {};
        const name = props.Name ?? '';
        if (!name) continue;

        const { fill, stroke } = this.polityStyle(name);

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

        const tier = labelTiers.get(`${name}|${props.FromYear ?? ''}|${props.ToYear ?? ''}`);
        const anchor = tier === undefined ? null : labelAnchor(feature);
        if (tier !== undefined && anchor) {
          const text = locale === 'en' ? name : (names[name] ?? '').trim() || name;
          // The globe opens at ~2e7 m, so the top rank has to survive the whole
          // view or the layer looks broken from the default camera.
          const far = tier === 2 ? 26_000_000 : tier === 1 ? 9_000_000 : 3_000_000;
          const labelEntity = entities.add({
            show: labelsOn,
            position: Cesium.Cartesian3.fromDegrees(anchor[0], anchor[1], 0),
            label: {
              text,
              font: '600 15px "Noto Sans SC", "PingFang SC", system-ui, sans-serif',
              fillColor: Cesium.Color.fromCssColorString('#2a2724'),
              outlineColor: Cesium.Color.fromCssColorString('#f6f1e7'),
              outlineWidth: 4,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              // Same paper wash as the flat map: the imagery prints its own
              // place names underneath.
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#f6f1e7').withAlpha(0.62),
              backgroundPadding: new Cesium.Cartesian2(4, 2),
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              // Depth testing stays on: names on the far side of the globe must
              // be hidden by the globe itself.
              // Rank decides how far out the name survives; no per-frame layout.
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far),
              // Barely shrinks with distance: at the default globe altitude a
              // 0.75 scale made the names unreadable against the imagery.
              scaleByDistance: new Cesium.NearFarScalar(2_000_000, 1.1, far, 0.95),
            },
          });
          this.polityLabels.push(labelEntity);
        }
      }
    } finally {
      entities.resumeEvents();
    }

    this.withheld = withheldParts;
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
    this.polityLabels = [];
  }

  /** Show or hide the polity names without rebuilding the polygons. */
  setPolityLabelsVisible(on: boolean) {
    for (const entity of this.polityLabels) entity.show = on;
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
     * exactly the value of the toned-down basemap underneath — so the layer
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
        const source = await Cesium.GeoJsonDataSource.load(
          await sanitizeBoundaries(bordersUrl),
          {
            stroke,
            strokeWidth: 2,
            clampToGround: false,
          },
        );
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

  flyTo(lon: number, lat: number, height = 1_800_000, duration = 1.4): Promise<boolean> {
    const viewer = this.viewer;
    if (!viewer) return Promise.resolve(false);
    // `camera.flyTo` is callback-based; wrap it so the story can await arrival.
    return new Promise<boolean>((resolve) => {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        duration,
        complete: () => resolve(true),
        cancel: () => resolve(false),
      });
    });
  }

  /** Current camera as lon/lat/height, so a story can restore the reader's view. */
  cameraView(): { lon: number; lat: number; height: number } {
    const viewer = this.viewer;
    if (!viewer) {
      return { lon: INITIAL_VIEW.lon, lat: INITIAL_VIEW.lat, height: INITIAL_VIEW.height };
    }
    const carto = viewer.camera.positionCartographic;
    return {
      lon: Cesium.Math.toDegrees(carto.longitude),
      lat: Cesium.Math.toDegrees(carto.latitude),
      height: carto.height,
    };
  }

  /**
   * Inertia keeps the camera gliding after a drag. A guided story owns the
   * camera, and that drift would fight the next flyTo, so it is paused while
   * the story plays and restored afterwards.
   */
  setCameraInertia(enabled: boolean) {
    const viewer = this.viewer;
    if (!viewer) return;
    const controller = viewer.scene.screenSpaceCameraController;
    // Cesium expresses inertia as a 0–1 damping factor, not a boolean.
    const factor = enabled ? 1 : 0;
    controller.inertiaSpin = factor;
    controller.inertiaTranslate = factor;
    controller.inertiaZoom = factor;
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
 * The same pass folds Taiwan into the China feature (see `lib/modernBorders`).
 */
async function sanitizeCountries(url: string): Promise<FeatureCollection> {
  const json = await fetchJson<FeatureCollection>(url);
  const normalized = normalizeModernCountries(json);
  return {
    ...normalized,
    features: normalized.features.map((feature) => ({
      ...feature,
      geometry: clampPolarGeometry(feature.geometry as GeoJsonGeometry | null) as Feature['geometry'],
    })),
  };
}

/**
 * Disputed / line-of-control / indefinite stretches are withheld from the
 * reference layer instead of being drawn as settled borders.
 */
async function sanitizeBoundaries(url: string): Promise<FeatureCollection> {
  const json = await fetchJson<FeatureCollection>(url);
  return neutralizeModernBoundaries(json);
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

/** Kilometres per degree of latitude/longitude at the equator (mean Earth). */
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;

/** Story region circles were oversized; scale down the authored radius. */
const STORY_RADIUS_SCALE = 0.2;

/**
 * A regular polygon approximating a circle of `radiusKm` around a point.
 * Longitude is scaled by `cos(lat)` so the circle is round on the globe, not
 * only in raw degrees.
 */
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

/** Close a ring if the author left it open, so polygon renderers are happy. */
function closedRing(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
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
