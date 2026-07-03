/**
 * Theme engine — CSS-variable-based theming with localStorage persistence.
 *
 * Three built-in themes:
 *   blue      – current blue-purple sci-fi style
 *   warm      – warm parchment/sepia classical style
 *   ink       – black-white Chinese ink painting style
 *
 * Usage:
 *   import { THEMES, getSavedTheme, applyTheme, getCurrentTheme } from './themes/themes.js';
 *   applyTheme('warm');
 */

const CSS_VAR_NAMES = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-panel',
  '--bg-panel-solid',
  '--bg-card-start',
  '--bg-card-end',
  '--bg-card-solid',
  '--bg-input',
  '--bg-overlay',
  '--bg-timeline-start',
  '--bg-timeline-end',
  '--border-primary',
  '--border-secondary',
  '--border-accent',
  '--border-accent-hover',
  '--border-input',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-dim',
  '--text-faint',
  '--text-very-faint',
  '--text-link',
  '--text-white',
  '--accent-gold',
  '--accent-gold-glow',
  '--accent-blue',
  '--accent-blue-hover',
  '--accent-blue-bg',
  '--accent-green',
  '--accent-green-border',
  '--accent-red',
  '--accent-red-border',
  '--btn-bg',
  '--btn-border',
  '--btn-hover',
  '--btn-text',
  '--card-glow',
  '--card-shadow',
  '--scrollbar-thumb',
  '--globe-ocean',
  '--filter-dot-border',
  '--track-glow',
  '--divider',
];

const THEME_DEFS = {
  blue: {
    label: '蓝紫色 (当前)',
    labelEn: 'Blue-Purple',
    vars: {
      '--bg-primary': '#0a0a0a',
      '--bg-secondary': '#1a1a2e',
      '--bg-tertiary': '#0f0f1a',
      '--bg-panel': 'rgba(10,10,26,0.88)',
      '--bg-panel-solid': 'rgba(10,10,26,0.92)',
      '--bg-card-start': '#1a1a2e',
      '--bg-card-end': '#16213e',
      '--bg-card-solid': '#16213e',
      '--bg-input': '#1a1a3e',
      '--bg-overlay': 'rgba(5,5,15,0.92)',
      '--bg-timeline-start': '#1a1a2e',
      '--bg-timeline-end': '#0f0f1a',
      '--border-primary': '#2a2a4a',
      '--border-secondary': '#3a3a5a',
      '--border-accent': '#4a60af',
      '--border-accent-hover': '#6a80cf',
      '--border-input': '#4a4a7a',
      '--text-primary': '#e0e0e0',
      '--text-secondary': '#cccccc',
      '--text-muted': '#999999',
      '--text-dim': '#888888',
      '--text-faint': '#777777',
      '--text-very-faint': '#666666',
      '--text-link': '#8ab4f8',
      '--text-white': '#ffffff',
      '--accent-gold': '#ffd700',
      '--accent-gold-glow': 'rgba(255,215,0,0.5)',
      '--accent-blue': '#4a60af',
      '--accent-blue-hover': '#5a70bf',
      '--accent-blue-bg': 'rgba(74,96,175,0.12)',
      '--accent-green': '#2c6e49',
      '--accent-green-border': '#40916c',
      '--accent-red': '#c0392b',
      '--accent-red-border': '#e74c3c',
      '--btn-bg': '#2a2a4a',
      '--btn-border': '#4a4a7a',
      '--btn-hover': '#3a3a5a',
      '--btn-text': '#cccccc',
      '--card-glow': 'rgba(74,96,175,0.3)',
      '--card-shadow': 'rgba(0,0,0,0.8)',
      '--scrollbar-thumb': '#4a4a7a',
      '--globe-ocean': '#1a6080',
      '--filter-dot-border': '#555555',
      '--track-glow': 'rgba(74,96,175,0.3)',
      '--divider': '#2a2a4a',
    },
  },

  warm: {
    label: '暖色古典',
    labelEn: 'Warm Classical',
    vars: {
      '--bg-primary': '#1a1410',
      '--bg-secondary': '#2c2418',
      '--bg-tertiary': '#1f1812',
      '--bg-panel': 'rgba(28,20,12,0.90)',
      '--bg-panel-solid': 'rgba(28,20,12,0.94)',
      '--bg-card-start': '#2c2418',
      '--bg-card-end': '#1f1812',
      '--bg-card-solid': '#1f1812',
      '--bg-input': '#2a1f14',
      '--bg-overlay': 'rgba(15,10,6,0.94)',
      '--bg-timeline-start': '#2c2418',
      '--bg-timeline-end': '#1a1410',
      '--border-primary': '#3a2e1a',
      '--border-secondary': '#4a3a24',
      '--border-accent': '#b8860b',
      '--border-accent-hover': '#d4a030',
      '--border-input': '#5a4a30',
      '--text-primary': '#e8dcc8',
      '--text-secondary': '#d4c8a8',
      '--text-muted': '#a09080',
      '--text-dim': '#8a7a6a',
      '--text-faint': '#7a6a5a',
      '--text-very-faint': '#6a5a4a',
      '--text-link': '#c49020',
      '--text-white': '#f5edd8',
      '--accent-gold': '#d4a030',
      '--accent-gold-glow': 'rgba(212,160,48,0.5)',
      '--accent-blue': '#b8860b',
      '--accent-blue-hover': '#c49020',
      '--accent-blue-bg': 'rgba(184,134,11,0.15)',
      '--accent-green': '#5a7a4a',
      '--accent-green-border': '#6a8a5a',
      '--accent-red': '#8b4513',
      '--accent-red-border': '#a0522d',
      '--btn-bg': '#3a2e1a',
      '--btn-border': '#5a4a30',
      '--btn-hover': '#4a3a24',
      '--btn-text': '#d4c8a8',
      '--card-glow': 'rgba(184,134,11,0.25)',
      '--card-shadow': 'rgba(0,0,0,0.8)',
      '--scrollbar-thumb': '#5a4a30',
      '--globe-ocean': '#3a6a5a',
      '--filter-dot-border': '#5a4a30',
      '--track-glow': 'rgba(184,134,11,0.25)',
      '--divider': '#3a2e1a',
    },
  },

  ink: {
    label: '水墨中国',
    labelEn: 'Ink Chinese',
    vars: {
      '--bg-primary': '#0d0d0d',
      '--bg-secondary': '#1a1a1a',
      '--bg-tertiary': '#111111',
      '--bg-panel': 'rgba(15,15,15,0.92)',
      '--bg-panel-solid': 'rgba(15,15,15,0.95)',
      '--bg-card-start': '#1a1a1a',
      '--bg-card-end': '#111111',
      '--bg-card-solid': '#111111',
      '--bg-input': '#1a1a1a',
      '--bg-overlay': 'rgba(5,5,5,0.94)',
      '--bg-timeline-start': '#1a1a1a',
      '--bg-timeline-end': '#0d0d0d',
      '--border-primary': '#2a2a2a',
      '--border-secondary': '#333333',
      '--border-accent': '#666666',
      '--border-accent-hover': '#888888',
      '--border-input': '#3a3a3a',
      '--text-primary': '#d0d0d0',
      '--text-secondary': '#b0b0b0',
      '--text-muted': '#808080',
      '--text-dim': '#707070',
      '--text-faint': '#606060',
      '--text-very-faint': '#505050',
      '--text-link': '#999999',
      '--text-white': '#e8e8e8',
      '--accent-gold': '#c8c0b0',
      '--accent-gold-glow': 'rgba(200,192,176,0.35)',
      '--accent-blue': '#808080',
      '--accent-blue-hover': '#999999',
      '--accent-blue-bg': 'rgba(128,128,128,0.12)',
      '--accent-green': '#4a5a4a',
      '--accent-green-border': '#5a6a5a',
      '--accent-red': '#6a4a4a',
      '--accent-red-border': '#7a5a5a',
      '--btn-bg': '#222222',
      '--btn-border': '#3a3a3a',
      '--btn-hover': '#333333',
      '--btn-text': '#b0b0b0',
      '--card-glow': 'rgba(128,128,128,0.15)',
      '--card-shadow': 'rgba(0,0,0,0.9)',
      '--scrollbar-thumb': '#3a3a3a',
      '--globe-ocean': '#2a3a4a',
      '--filter-dot-border': '#444444',
      '--track-glow': 'rgba(128,128,128,0.15)',
      '--divider': '#2a2a2a',
    },
  },
};

const STORAGE_KEY = 'earth-theme';

/** Apply a theme by id, returns the theme def. */
export function applyTheme(id) {
  const theme = THEME_DEFS[id];
  if (!theme) return null;
  const root = document.documentElement;
  for (const name of CSS_VAR_NAMES) {
    if (theme.vars[name] != null) {
      root.style.setProperty(name, theme.vars[name]);
    }
  }
  root.setAttribute('data-theme', id);
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  return theme;
}

/** Get the currently active theme id. */
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'blue';
}

/** Get saved theme id from localStorage, or default. */
export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEME_DEFS[saved]) return saved;
  } catch {}
  return 'blue';
}

/** List of all theme definitions. */
export const THEMES = Object.entries(THEME_DEFS).map(([id, def]) => ({
  id,
  label: def.label,
  labelEn: def.labelEn,
}));
