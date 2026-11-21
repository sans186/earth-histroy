import { describe, expect, it } from 'vitest';
import { bboxIntersects, parseCoordinates, ringBBox } from '@/lib/geo';

describe('parseCoordinates', () => {
  it('reads the dataset convention: latitude first', () => {
    expect(parseCoordinates('30.5, 114.3')).toEqual({ lon: 114.3, lat: 30.5 });
  });

  it('gives compass suffixes precedence, including western longitudes', () => {
    expect(parseCoordinates('30.5N, 114.3W')).toEqual({ lon: -114.3, lat: 30.5 });
  });

  it('detects lon-first strings when the first value cannot be a latitude', () => {
    expect(parseCoordinates('151.2, -33.9')).toEqual({ lon: 151.2, lat: -33.9 });
  });

  it('rejects garbage and out-of-range values', () => {
    expect(parseCoordinates('not a coordinate')).toBeNull();
    expect(parseCoordinates('120, 95')).toBeNull();
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates(null)).toBeNull();
  });

  it('accepts objects and arrays', () => {
    expect(parseCoordinates({ latitude: -33.9, longitude: 151.2 })).toEqual({
      lon: 151.2,
      lat: -33.9,
    });
    expect(parseCoordinates([30.5, 114.3])).toEqual({ lon: 114.3, lat: 30.5 });
    expect(parseCoordinates([95, 30.5])).toEqual({ lon: 95, lat: 30.5 });
  });
});

describe('ringBBox / bboxIntersects', () => {
  it('returns null for an empty ring set', () => {
    expect(ringBBox([])).toBeNull();
  });

  it('computes the extents of every ring', () => {
    expect(
      ringBBox([
        [
          [0, 0],
          [10, 5],
        ],
        [
          [-2, 8],
          [4, -3],
        ],
      ]),
    ).toEqual([-2, -3, 10, 8]);
  });

  it('treats a touching edge as an intersection', () => {
    const rect = { west: 10, south: 0, east: 20, north: 10 };
    expect(bboxIntersects([0, 0, 10, 10], rect)).toBe(true);
    expect(bboxIntersects([0, 0, 9.9, 10], rect)).toBe(false);
    expect(bboxIntersects([0, 11, 10, 20], rect)).toBe(false);
  });
});
