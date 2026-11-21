import { describe, expect, it } from 'vitest';
import {
  SCALE_MAX,
  SCALE_MIN,
  YEAR_MAX,
  YEAR_MIN,
  getEra,
  scaleToYear,
  yearToScale,
} from '@/config';

describe('yearToScale / scaleToYear', () => {
  it('maps the dataset bounds to the ends of the scale', () => {
    expect(yearToScale(YEAR_MIN)).toBe(SCALE_MIN);
    expect(yearToScale(YEAR_MAX)).toBe(SCALE_MAX);
    expect(scaleToYear(SCALE_MIN)).toBe(YEAR_MIN);
    expect(scaleToYear(SCALE_MAX)).toBe(YEAR_MAX);
  });

  it('clamps values outside the shipped range', () => {
    expect(yearToScale(YEAR_MIN - 500)).toBe(SCALE_MIN);
    expect(yearToScale(YEAR_MAX + 50)).toBe(SCALE_MAX);
    expect(scaleToYear(SCALE_MIN - 1)).toBe(YEAR_MIN);
    expect(scaleToYear(SCALE_MAX + 1)).toBe(YEAR_MAX);
  });

  it('keeps the segment breakpoints aligned', () => {
    for (const [year, scale] of [
      [-500, 1000],
      [500, 2500],
      [1500, 4500],
      [1800, 6000],
      [1950, 8000],
    ]) {
      expect(yearToScale(year)).toBe(scale);
      expect(scaleToYear(scale)).toBe(year);
    }
  });

  it('round-trips sample years, including BCE', () => {
    const years = [YEAR_MIN, -1046, -221, -1, 1, 581, 1368, 1840, 1911, 1949, 2025];
    for (const year of years) {
      expect(scaleToYear(yearToScale(year))).toBe(year);
    }
  });
});

describe('getEra', () => {
  it('treats each era as [start, end)', () => {
    expect(getEra(-3100).id).toBe('bronze');
    expect(getEra(-1046).id).toBe('iron');
    expect(getEra(-221).id).toBe('classical');
    expect(getEra(581).id).toBe('medieval');
    expect(getEra(1368).id).toBe('earlyModern');
    expect(getEra(1840).id).toBe('modern');
    expect(getEra(1949).id).toBe('contemporary');
  });

  it('falls back to the last era past the recorded range', () => {
    expect(getEra(2027).id).toBe('contemporary');
  });
});
