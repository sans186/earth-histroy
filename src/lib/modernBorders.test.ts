import { describe, expect, it } from 'vitest';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import {
  isNeutralBoundary,
  neutralizeModernBoundaries,
  normalizeModernCountries,
} from './modernBorders';

const CHINA_RING: number[][][] = [
  [
    [100, 20],
    [105, 20],
    [105, 25],
    [100, 20],
  ],
];

const TAIWAN_RING: number[][][] = [
  [
    [120, 22],
    [122, 22],
    [122, 25],
    [120, 22],
  ],
];

function feature(properties: Record<string, unknown>, coordinates = CHINA_RING): Feature {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Polygon', coordinates },
  };
}

function collection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('normalizeModernCountries', () => {
  it('folds Taiwan into China and drops the Taiwan feature', () => {
    const china = feature({ NAME: 'China', POP_EST: 1400000000 });
    const taiwan = feature({ NAME: 'Taiwan', SOVEREIGNT: 'Taiwan' }, TAIWAN_RING);
    const result = normalizeModernCountries(collection([china, taiwan]));

    expect(result.features).toHaveLength(1);
    const merged = result.features[0];
    expect(merged.properties).toEqual({ NAME: 'China', POP_EST: 1400000000 });
    expect(merged.geometry?.type).toBe('MultiPolygon');
    const geometry = merged.geometry as MultiPolygon;
    expect(geometry.coordinates).toEqual([CHINA_RING, TAIWAN_RING]);
  });

  it('leaves the collection untouched when Taiwan is absent', () => {
    const input = collection([feature({ NAME: 'China' })]);
    expect(normalizeModernCountries(input)).toBe(input);
  });

  it('leaves the collection untouched when there is no China feature to fold into', () => {
    const input = collection([feature({ NAME: 'Taiwan', SOVEREIGNT: 'Taiwan' }, TAIWAN_RING)]);
    expect(normalizeModernCountries(input)).toBe(input);
    expect(input.features).toHaveLength(1);
  });
});

describe('neutralizeModernBoundaries', () => {
  it('drops disputed stretches and keeps international boundaries', () => {
    const international = feature({ FEATURECLA: 'International boundary (verify)' });
    const disputed = feature({ FEATURECLA: 'Disputed (please verify)' });
    const control = feature({ FEATURECLA: 'Line of control (please verify)' });
    const result = neutralizeModernBoundaries(collection([international, disputed, control]));

    expect(result.features).toEqual([international]);
  });

  it('classifies the upstream boundary strings case-insensitively', () => {
    expect(isNeutralBoundary(feature({ FEATURECLA: 'disputed (please verify)' }))).toBe(true);
    expect(isNeutralBoundary(feature({ FEATURECLA: 'Indeterminant frontier' }))).toBe(true);
    expect(
      isNeutralBoundary(feature({ FEATURECLA: 'International boundary (verify)' })),
    ).toBe(false);
    expect(isNeutralBoundary(feature({}))).toBe(false);
  });
});
