// Noni design tokens — source of truth is DESIGN.md at repo root.
// Direction: Warm Dark with a disciplined three-accent system.
// Primary = Plum (CTAs, toasts). Secondary = Indigo (links, nav). Emphasis = Rose (italic emotional accents).

export const colors = {
  bg: '#0E0B0A',
  background: '#0E0B0A',
  surface: '#1A1513',
  surfaceElev: '#241E1A',
  surfaceMuted: '#241E1A',
  surfaceGlow: '#2E251F',
  border: '#2A221E',
  borderStrong: '#3A2F29',

  text: '#F5EFE7',
  textMuted: '#9E948A',
  textDim: '#6E655D',

  primary: '#8E6B8E',
  primaryMuted: 'rgba(142, 107, 142, 0.16)',
  primaryGlow: 'rgba(142, 107, 142, 0.26)',
  primaryInk: '#120816',

  secondary: '#6B7B9B',
  secondaryMuted: 'rgba(107, 123, 155, 0.16)',
  secondaryGlow: 'rgba(107, 123, 155, 0.22)',

  emphasis: '#D48A8A',
  emphasisMuted: 'rgba(212, 138, 138, 0.16)',

  success: '#6FA88B',
  warning: '#D4A24C',
  crisis: '#C75450',
  crisisSoft: 'rgba(199, 84, 80, 0.14)',
  danger: '#C75450',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 9999,
} as const;

export const fonts = {
  display: 'Fraunces',
  displayItalic: 'Fraunces-Italic',
  displayStrong: 'Fraunces-SemiBold',
  body: 'GeneralSans',
  bodyMedium: 'GeneralSans-Medium',
  bodyStrong: 'GeneralSans-SemiBold',
  mono: 'Geist',
  monoMedium: 'Geist-Medium',
} as const;

export const typography = {
  display: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  displayItalic: {
    fontFamily: fonts.displayItalic,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  headline: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  mono: {
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'] as Array<'tabular-nums'>,
  },
};

export const motion = {
  duration: {
    micro: 100,
    short: 250,
    medium: 400,
    long: 700,
  },
  easing: {
    enter: 'cubic-bezier(0.2, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    move: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

export const layout = {
  maxContentPhone: 420,
  maxContentTablet: 560,
  maxContentWide: 720,
} as const;
