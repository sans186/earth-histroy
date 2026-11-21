import { describe, expect, it } from 'vitest';
import {
  formatYear,
  formatYearCompact,
  formatYearRange,
  formatYearShort,
} from '@/lib/format';

describe('formatYear', () => {
  it('spells out positive years per locale', () => {
    expect(formatYear(1912, 'zh')).toBe('1912 年');
    expect(formatYear(1912, 'en')).toBe('1912 CE');
  });

  it('turns negative years into BCE', () => {
    expect(formatYear(-221, 'zh')).toBe('公元前 221');
    expect(formatYear(-221, 'en')).toBe('221 BCE');
    expect(formatYear(-1, 'zh')).toBe('公元前 1');
  });

  it('keeps year zero as a plain value', () => {
    expect(formatYear(0, 'zh')).toBe('0 年');
    expect(formatYear(0, 'en')).toBe('0 CE');
  });
});

describe('formatYearShort / formatYearCompact', () => {
  it('drops the era for CE years', () => {
    expect(formatYearShort(1912)).toBe('1912');
    expect(formatYearCompact(1912, 'zh')).toBe('1912');
    expect(formatYearCompact(1912, 'en')).toBe('1912');
  });

  it('keeps a terse BCE marker', () => {
    expect(formatYearShort(-1)).toBe('1 BCE');
    expect(formatYearCompact(-500, 'zh')).toBe('前500');
    expect(formatYearCompact(-500, 'en')).toBe('500 BCE');
  });
});

describe('formatYearRange', () => {
  it('collapses a one-year span', () => {
    expect(formatYearRange(1912, 1912, 'zh')).toBe('1912');
  });

  it('formats spans across the BCE/CE boundary', () => {
    expect(formatYearRange(-221, 1912, 'en')).toBe('221 BCE – 1912');
    expect(formatYearRange(-3100, 2026, 'zh')).toBe('前3100 – 2026');
    expect(formatYearRange(-1, 1, 'zh')).toBe('前1 – 1');
  });

  it('marks an open end with an ellipsis', () => {
    expect(formatYearRange(1776, 2026, 'zh', { openEnd: true })).toBe('1776 – …');
    expect(formatYearRange(null, 2026, 'en', { openEnd: true })).toBe('? – …');
  });

  it('prints a question mark for unknown ends', () => {
    expect(formatYearRange(1949, null, 'zh')).toBe('1949 – ?');
    expect(formatYearRange(undefined, 1949, 'zh')).toBe('? – 1949');
    expect(formatYearRange(undefined, undefined, 'en')).toBe('—');
    expect(formatYearRange(null, null, 'en')).toBe('—');
  });
});
