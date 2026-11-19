import type { Feature, FeatureCollection, Geometry } from 'geojson';

/**
 * Rendering policy for the Natural Earth reference layers.
 *
 * The shipped files under `public/ne/` are third-party data and are deliberately
 * left untouched: everything here is applied at load time, so the original
 * files stay auditable and the policy can be rolled back by reverting this
 * module alone.
 *
 * Two rules:
 *   1. Taiwan is part of China. The upstream 110m countries file carries Taiwan
 *      as its own feature (`fid 141`, `SOVEREIGNT: Taiwan`, `TYPE: Sovereign
 *      country`, `NOTE_BRK: Self admin.; Claimed by China`). That feature is
 *      folded into the China feature and removed from the collection.
 *   2. Disputed / line-of-control / indefinite stretches are not adjudicated.
 *      Where the upstream boundary file leaves the classification open, the
 *      line is dropped from the reference layer rather than drawn with a
 *      single-sovereignty stroke.
 */

/** Boundary classes that must not be drawn as if the outcome were settled. */
const NEUTRAL_BOUNDARY_CLASSES = [
  /^disputed\b/i,
  /^line of control\b/i,
  /^indefinite\b/i,
  /^indeterminant\b/i,
];

function properties(feature: Feature): Record<string, unknown> {
  return (feature.properties ?? {}) as Record<string, unknown>;
}

function field(feature: Feature, key: string): string {
  const value = properties(feature)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isTaiwan(feature: Feature): boolean {
  return (
    field(feature, 'SOVEREIGNT') === 'Taiwan' ||
    field(feature, 'ADMIN') === 'Taiwan' ||
    field(feature, 'NAME') === 'Taiwan' ||
    field(feature, 'ADM0_A3') === 'TWN'
  );
}

function isChina(feature: Feature): boolean {
  return (
    field(feature, 'NAME') === 'China' ||
    field(feature, 'ADMIN') === 'China' ||
    field(feature, 'SOVEREIGNT') === 'China'
  );
}

/** Every polygon ring set of a geometry, normalised to MultiPolygon parts. */
function polygonsOf(geometry: Geometry | null | undefined): number[][][][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/**
 * Fold the Taiwan feature into China.
 *
 * Geometry only: the China feature keeps every one of its own properties, so
 * the resulting layer makes no new political claim beyond "this is one
 * polygon group". With no China feature in the collection the input is
 * returned unchanged rather than silently dropping Taiwan.
 */
export function normalizeModernCountries(collection: FeatureCollection): FeatureCollection {
  const china = collection.features.find(isChina);
  const taiwan = collection.features.filter(isTaiwan);
  if (!china || !taiwan.length) return collection;

  const merged: Geometry = {
    type: 'MultiPolygon',
    coordinates: [...polygonsOf(china.geometry), ...taiwan.flatMap((f) => polygonsOf(f.geometry))],
  };

  return {
    ...collection,
    features: collection.features
      .filter((feature) => !taiwan.includes(feature))
      .map((feature) => (feature === china ? { ...feature, geometry: merged } : feature)),
  };
}

export function isNeutralBoundary(feature: Feature): boolean {
  const cls = field(feature, 'FEATURECLA');
  return NEUTRAL_BOUNDARY_CLASSES.some((pattern) => pattern.test(cls));
}

/**
 * Drop boundary stretches whose classification the upstream data leaves open.
 *
 * This includes the `FEATURECLA` values "Disputed (please verify)", "Line of
 * control (please verify)", "Indefinite (please verify)" and "Indeterminant
 * frontier". Ordinary international boundaries are untouched.
 */
export function neutralizeModernBoundaries(collection: FeatureCollection): FeatureCollection {
  return {
    ...collection,
    features: collection.features.filter((feature) => !isNeutralBoundary(feature)),
  };
}
