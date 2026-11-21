import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@/types';
import { regionOf } from '@/lib/regions';

/** Only the fields `regionOf` reads matter here. */
function eventAt(lon: number, lat: number, region: string, title = ''): TimelineEvent {
  return { lon, lat, region, title } as unknown as TimelineEvent;
}

describe('regionOf around the Black Sea', () => {
  it('puts Crimea in Europe when the row names Russia (AB-001)', () => {
    // 1854-003, Alma: 44.5N / 33.8E, region "克里米亚，俄罗斯帝国".
    // Both the Mediterranean and Europe boxes cover the point; the keyword decides.
    const crimea = eventAt(
      33.8,
      44.5,
      '克里米亚，俄罗斯帝国',
      '克里米亚战争：阿尔马战役；英法联军击败俄军',
    );
    expect(regionOf(crimea)).toBe('europe');
  });

  it('keeps the southern Crimean coast in Europe', () => {
    expect(regionOf(eventAt(34.2, 44.4, '克里米亚，俄罗斯帝国'))).toBe('europe');
  });

  it('uses the Russian keyword inside the overlapping boxes', () => {
    // Sea of Azov: inside both boxes, so the region name breaks the tie.
    expect(regionOf(eventAt(38.5, 46.5, '俄罗斯帝国'))).toBe('europe');
    // Just below the Mediterranean box's 48N edge.
    expect(regionOf(eventAt(34.0, 47.8, '俄国'))).toBe('europe');
  });

  it('places a point north of 48N in Europe by box alone', () => {
    // Above the Mediterranean box, so no keyword is needed.
    expect(regionOf(eventAt(34.0, 48.2, '黑海北岸'))).toBe('europe');
  });

  it('lets a Middle East keyword win at the Bosphorus', () => {
    // 41.1N / 29.0E falls inside the Mediterranean, Europe and Middle East boxes.
    expect(regionOf(eventAt(29.0, 41.1, '奥斯曼帝国'))).toBe('middleEast');
  });

  it('falls back to the region name when no box covers the point', () => {
    // 43.5N / 45.6E sits east of the Mediterranean and Europe boxes.
    expect(regionOf(eventAt(45.6, 43.5, '俄罗斯帝国'))).toBe('europe');
  });
});
