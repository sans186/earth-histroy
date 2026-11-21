import { describe, expect, it } from 'vitest';
import type { PolityFeature, PolityProperties } from '@/types';
import {
  labelAnchor,
  makePolityScope,
  pointInPolity,
  scopeHasPoint,
  scopeMentions,
  scopeOverlapsYears,
  withRecordedSpan,
} from '@/lib/polityScope';

/** Closed square ring, counter-clockwise, as GeoJSON expects. */
function square(w: number, s: number, e: number, n: number): number[][] {
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

function polygon(rings: number[][][], props: PolityProperties = {}): PolityFeature {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Polygon', coordinates: rings },
  };
}

function multiPolygon(polys: number[][][][], props: PolityProperties = {}): PolityFeature {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'MultiPolygon', coordinates: polys },
  };
}

const qing = polygon([square(0, 0, 10, 10)], { Name: 'Qing dynasty', FromYear: 1644, ToYear: 1912 });

describe('makePolityScope', () => {
  it('uses the name as identity and collects Chinese + core spellings', () => {
    // The Chinese map is keyed differently in casing; the lookup is case-insensitive.
    const scope = makePolityScope(qing, { 'QING DYNASTY': '清朝' });

    expect(scope.key).toBe('Qing dynasty');
    expect(scope.label).toBe('清朝');
    expect(scope.from).toBe(1644);
    expect(scope.to).toBe(1912);
    expect(scope.box).toEqual({ west: 0, south: 0, east: 10, north: 10 });
    expect(scope.needles).toEqual(['Qing dynasty', '清朝', 'Qing']);
  });

  it('unwraps parenthesised duplicate names for identity, keeping the raw label', () => {
    const duplicated = polygon([square(0, 0, 10, 10)], { Name: '(Qing Dynasty)' });
    const scope = makePolityScope(duplicated);

    expect(scope.key).toBe('Qing Dynasty');
    expect(scope.label).toBe('(Qing Dynasty)');
  });
});

describe('scopeMentions', () => {
  const scope = makePolityScope(qing, { 'Qing dynasty': '清朝' });

  it('matches any needle, case-insensitively, across several texts', () => {
    expect(scopeMentions(scope, 'The QING DYNASTY fell in 1912')).toBe(true);
    expect(scopeMentions(scope, '与清朝有关', null)).toBe(true);
    expect(scopeMentions(scope, 'Qing', undefined)).toBe(true);
  });

  it('returns false for unrelated or empty text', () => {
    expect(scopeMentions(scope, 'Roman Republic')).toBe(false);
    expect(scopeMentions(scope, '', null, undefined)).toBe(false);
  });
});

describe('withRecordedSpan', () => {
  const scope = makePolityScope(qing);

  it('overrides the per-slice dates', () => {
    expect(withRecordedSpan(scope, 1645, 1911)).toMatchObject({ from: 1645, to: 1911 });
  });

  it('keeps the scope untouched when the span is invalid', () => {
    expect(withRecordedSpan(scope, 1912, 1644)).toBe(scope);
    expect(withRecordedSpan(scope, Number.NaN, 1911)).toBe(scope);
  });
});

describe('scopeOverlapsYears', () => {
  const scope = makePolityScope(qing);

  it('includes a boundary year', () => {
    expect(scopeOverlapsYears(scope, 1912, 1912)).toBe(true);
    expect(scopeOverlapsYears(scope, 1500, 1644)).toBe(true);
  });

  it('excludes an item that starts after the polity ended', () => {
    expect(scopeOverlapsYears(scope, 1913, 1920)).toBe(false);
  });

  it('keeps items with no dates', () => {
    expect(scopeOverlapsYears(scope, null, null)).toBe(true);
  });
});

describe('scopeHasPoint / pointInPolity', () => {
  it('accepts a point inside the outline and rejects one outside the box', () => {
    const scope = makePolityScope(qing);

    expect(scopeHasPoint(scope, 5, 5)).toBe(true);
    expect(scopeHasPoint(scope, 20, 20)).toBe(false);
    expect(scopeHasPoint(scope, null, 5)).toBe(false);
  });

  it('treats inner rings as holes', () => {
    const withHole = polygon([square(0, 0, 10, 10), square(2, 2, 8, 8)]);

    expect(pointInPolity(withHole, 1, 5)).toBe(true);
    expect(pointInPolity(withHole, 5, 5)).toBe(false);
  });

  it('checks every part of a MultiPolygon', () => {
    const islands = multiPolygon([
      [square(0, 0, 2, 2)],
      [square(10, 10, 12, 12)],
    ]);

    expect(pointInPolity(islands, 11, 11)).toBe(true);
    expect(pointInPolity(islands, 5, 5)).toBe(false);
  });

  it('returns null when the geometry cannot be read', () => {
    const noGeometry = { type: 'Feature', properties: {}, geometry: {} } as unknown as PolityFeature;
    expect(pointInPolity(noGeometry, 5, 5)).toBeNull();
  });
});

describe('labelAnchor', () => {
  it('skips the box centre when it falls in a concave notch', () => {
    const lShape = polygon([
      [
        [0, 0],
        [10, 0],
        [10, 4],
        [4, 4],
        [4, 10],
        [0, 10],
        [0, 0],
      ],
    ]);

    expect(labelAnchor(lShape)).toEqual([3, 5]);
  });

  it('returns null without a geometry', () => {
    const noGeometry = { type: 'Feature', properties: {} } as unknown as PolityFeature;
    expect(labelAnchor(noGeometry)).toBeNull();
  });
});
