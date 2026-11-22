import { describe, expect, it } from 'vitest';
import type { PersonPoint } from '@/types';
import { buildTrailScene, niceStep, stageOf, ticksBetween } from '@/lib/trajectory';

function point(
  year: number,
  coords: [number, number] | null,
  yearEnd: number | null = null,
): PersonPoint {
  return {
    year,
    yearEnd,
    place: '',
    placeEn: '',
    coords,
    title: '',
    titleEn: '',
    description: '',
    descriptionEn: '',
  };
}

const ROUTE = [point(1900, [0, 0]), point(1910, [10, 20])];

function sceneAt(year: number, points: PersonPoint[] = ROUTE) {
  return buildTrailScene([{ personId: 'p1', points }], year);
}

describe('buildTrailScene', () => {
  it('cuts the last leg at a cursor between two stations', () => {
    const scene = sceneAt(1905);

    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].year).toBe(1900);
    expect(scene.segments).toHaveLength(1);

    const segment = scene.segments[0];
    expect(segment.partial).toBe(true);
    expect(segment.coords[0]).toEqual([0, 0]);
    expect(segment.coords[1]).toEqual([5, 10]);

    expect(scene.heads).toHaveLength(1);
    expect([scene.heads[0].lon, scene.heads[0].lat]).toEqual(segment.coords[1]);
    expect(scene.hidden).toBe(1);
  });

  it('shows no station or leg before the first recorded year but keeps the full bounds', () => {
    const scene = sceneAt(1890);

    expect(scene.nodes).toEqual([]);
    expect(scene.segments).toEqual([]);
    expect(scene.heads).toEqual([]);
    expect(scene.hidden).toBe(2);
    expect(scene.bounds).toEqual([
      [0, 0],
      [10, 20],
    ]);
  });

  it('shows the whole route once the cursor passes the last station', () => {
    const scene = sceneAt(1920);

    expect(scene.nodes).toHaveLength(2);
    expect(scene.nodes[1].current).toBe(true);
    expect(scene.segments).toHaveLength(1);
    expect(scene.segments[0].partial).toBe(false);
    expect(scene.segments[0].coords[1]).toEqual([10, 20]);
    expect(scene.heads[0]).toMatchObject({ lon: 10, lat: 20 });
    expect(scene.hidden).toBe(0);
  });
});

describe('stageOf', () => {
  it('folds a span of twelve years or less into a single stage', () => {
    expect(stageOf(1900, 1900, 1912)).toBe('single');
    expect(stageOf(1912, 1900, 1912)).toBe('single');
  });

  it('splits a thirteen-year span at the one-third boundaries', () => {
    expect(stageOf(0, 0, 13)).toBe('early');
    expect(stageOf(13 / 3, 0, 13)).toBe('middle');
    expect(stageOf(8, 0, 13)).toBe('middle');
    expect(stageOf(26 / 3, 0, 13)).toBe('late');
    expect(stageOf(13, 0, 13)).toBe('late');
  });
});

describe('niceStep / ticksBetween', () => {
  it('walks the 1 / 2 / 2.5 / 5 / 10 step ladder', () => {
    expect(niceStep(10, 10)).toBe(1);
    expect(niceStep(11, 10)).toBe(2);
    expect(niceStep(25, 10)).toBe(2.5);
    expect(niceStep(60, 10)).toBe(10);
    expect(niceStep(1000, 10)).toBe(100);
    expect(niceStep(0, 10)).toBe(1);
  });

  it('places ticks on that step inside the visible range', () => {
    expect(ticksBetween(0, 100, 10)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(ticksBetween(5, 95, 10)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(ticksBetween(5, 5, 10)).toEqual([5]);
  });
});
