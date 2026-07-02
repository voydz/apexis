import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#0A0C10',
  surface: '#141922',
  surfaceAlt: '#1B2230',
  border: '#242D3D',
  text: '#F2F5F9',
  textSecondary: '#8A94A6',
  textTertiary: '#5C6675',
  accent: '#B7F542',
  accentDim: 'rgba(183, 245, 66, 0.14)',
  onAccent: '#0A0C10',
  danger: '#FF5A5F',
  dangerDim: 'rgba(255, 90, 95, 0.14)',
  warning: '#FFB020',
  blue: '#4DA3FF',
  chartGrid: '#1E2634',
} as const;

export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  s: 10,
  m: 16,
  l: 22,
  full: 999,
} as const;

/** Monospaced digits for stat displays so numbers don't jump around. */
export const numericFont: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography = {
  hero: { fontSize: 64, fontWeight: '800' as const, letterSpacing: -2, color: colors.text, ...numericFont },
  statLarge: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1, color: colors.text, ...numericFont },
  statMedium: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.5, color: colors.text, ...numericFont },
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
} as const;
