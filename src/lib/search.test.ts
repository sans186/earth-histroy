import { describe, expect, it } from 'vitest';
import { buildSearchIndex, groupHits, searchItems, tokenize } from './search';
import type { SearchItem } from './search';

const ITEMS: SearchItem[] = [
  {
    id: '1912-001',
    type: 'event',
    zh: '泰坦尼克号沉没',
    en: 'Sinking of the Titanic',
    year: 1912,
  },
  {
    id: 'qin-shi-huang',
    type: 'person',
    zh: '秦始皇',
    en: 'Qin Shi Huang',
    year: -259,
  },
  {
    id: 'greco-persian-wars',
    type: 'war',
    zh: '希波战争',
    en: 'Greco-Persian Wars',
    year: -499,
  },
  {
    id: 'Qin',
    type: 'polity',
    zh: '秦',
    en: 'Qin',
    year: -221,
  },
];

const INDEX = buildSearchIndex(ITEMS);

describe('tokenize', () => {
  it('cuts Chinese runs into overlapping bigrams', () => {
    expect(tokenize('秦始皇')).toEqual(['秦始', '始皇']);
  });

  it('keeps a single Chinese character as a unigram', () => {
    expect(tokenize('秦')).toEqual(['秦']);
  });

  it('lower-cases and splits Latin text', () => {
    expect(tokenize('Qin Shi-Huang')).toEqual(['qin', 'shi', 'huang']);
  });

  it('ignores punctuation and whitespace', () => {
    expect(tokenize('  Titanic, 1912! ')).toEqual(['titanic', '1912']);
  });
});

describe('searchItems', () => {
  it('matches Chinese by bigram', () => {
    const hits = searchItems(INDEX, '泰坦');
    expect(hits[0]?.item.id).toBe('1912-001');
  });

  it('matches a single Chinese character without a bigram posting', () => {
    const hits = searchItems(INDEX, '始');
    expect(hits.some((hit) => hit.item.id === 'qin-shi-huang')).toBe(true);
  });

  it('matches English case-insensitively', () => {
    const hits = searchItems(INDEX, 'tItAnIc');
    expect(hits[0]?.item.id).toBe('1912-001');
  });

  it('matches an English prefix', () => {
    const hits = searchItems(INDEX, 'greco');
    expect(hits[0]?.item.id).toBe('greco-persian-wars');
  });

  it('ranks an exact name above a prefix match', () => {
    const hits = searchItems(INDEX, 'qin');
    expect(hits[0]?.item.id).toBe('Qin');
    expect(hits.map((hit) => hit.item.id)).toContain('qin-shi-huang');
  });

  it('returns nothing for an empty query', () => {
    expect(searchItems(INDEX, '')).toEqual([]);
    expect(searchItems(INDEX, '   ')).toEqual([]);
  });

  it('honours the result limit', () => {
    expect(searchItems(INDEX, 'in', 2)).toHaveLength(2);
  });

  it('groups hits in event / person / war / polity order', () => {
    const hits = searchItems(INDEX, 'titanic wars qin');
    expect(hits.some((hit) => hit.item.type === 'war')).toBe(true);
    const kinds = groupHits(hits).map((group) => group.kind);
    expect(kinds).toEqual(['event', 'person', 'war', 'polity']);
  });
});
