import { describe, expect, it } from 'vitest';
import type { RawGraphEdge, TimelineEvent } from '@/types';
import { edgeLinksOf, parseEventRef, yearOfEventId } from '@/lib/eventLinks';

function eventWithEdges(key: string, graphEdges: RawGraphEdge[]): TimelineEvent {
  return { key, graphEdges } as unknown as TimelineEvent;
}

describe('yearOfEventId', () => {
  it('reads CE and BCE years out of the id', () => {
    expect(yearOfEventId('1912-001')).toBe(1912);
    expect(yearOfEventId('-1-001')).toBe(-1);
  });

  it('returns null for strings that are not ids', () => {
    expect(yearOfEventId('1912')).toBeNull();
    expect(yearOfEventId('第一次巴尔干战争')).toBeNull();
  });
});

describe('parseEventRef', () => {
  it('keeps the id and uses the parenthetical title', () => {
    expect(parseEventRef('1912-001（第一次巴尔干战争，前奏）')).toEqual({
      raw: '1912-001（第一次巴尔干战争，前奏）',
      id: '1912-001',
      year: 1912,
      title: '第一次巴尔干战争，前奏',
    });
  });

  it('handles BCE ids', () => {
    const ref = parseEventRef('-1-001（罗马帝国建立）');
    expect(ref.id).toBe('-1-001');
    expect(ref.year).toBe(-1);
    expect(ref.title).toBe('罗马帝国建立');
  });

  it('falls back to a title-only reference with no id', () => {
    const ref = parseEventRef('汉朝建立');
    expect(ref.id).toBeNull();
    expect(ref.year).toBeNull();
    expect(ref.title).toBe('汉朝建立');
  });
});

describe('edgeLinksOf', () => {
  it('dedupes the same relation recorded in both directions', () => {
    const event = eventWithEdges('1912-001', [
      { from: '1912-001', to: '1900-002', relation: 'causes', note: '前因' },
      { from: '1900-002', to: '1912-001', relation: 'causes', note: '重复记录' },
    ]);

    expect(edgeLinksOf(event)).toEqual([
      { id: '1900-002', year: 1900, relation: 'causes', note: '前因', outgoing: true },
    ]);
  });

  it('marks incoming edges and skips self-loops and unrelated edges', () => {
    const event = eventWithEdges('1912-001', [
      { from: '1880-001', to: '1912-001', relation: 'follows' },
      { from: '1912-001', to: '1912-001', relation: 'self' },
      { from: '1880-001', to: '1870-003', relation: 'unrelated' },
      { from: '   ', to: '1870-004', relation: 'blank' },
    ]);

    expect(edgeLinksOf(event)).toEqual([
      { id: '1880-001', year: 1880, relation: 'follows', note: '', outgoing: false },
    ]);
  });

  it('returns an empty list when the event has no edges', () => {
    expect(edgeLinksOf(eventWithEdges('1912-001', []))).toEqual([]);
  });
});
