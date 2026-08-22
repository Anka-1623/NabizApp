import { Platform } from 'react-native';

// Stratos İHA marka dili (stratosiha.com) — bkz. stratosiha-social-media/design-language.md.
// Sıcak krem/kağıt zemin + koyu lacivert-siyah metin + petrol teal vurgu, nadiren mercan turuncu.
export const colors = {
  surface: '#ece8e1',
  surface2: '#f6f3ed',
  surface3: '#ded9cf',

  ink: '#05080f',
  inkMuted: '#475266',
  inkSubtle: '#5b667f',

  accent: '#1a6973',
  accentHover: '#134e56',
  accentSoft: '#1a697326',
  accentFg: '#f6f3ed',

  brand100: '#bfe3e8',
  brand200: '#80c7d0',
  brand300: '#4fb3bf',
  brand400: '#2a91a0',
  brand600: '#134e56',
  brand800: '#0a2a2e',

  coral: '#ff7849',

  danger: '#b42318',
  success: '#166534',

  line: '#05080f1a',
  lineStrong: '#05080f33',

  white: '#ffffff',
} as const;

export const fonts = {
  display: 'SpaceGrotesk-Bold',
  displayMedium: 'SpaceGrotesk-Medium',
  displayRegular: 'SpaceGrotesk-Regular',

  body: 'HankenGrotesk-Regular',
  bodyMedium: 'HankenGrotesk-Medium',
  bodySemiBold: 'HankenGrotesk-SemiBold',
  bodyBold: 'HankenGrotesk-Bold',

  mono: 'SpaceMono-Regular',
  monoBold: 'SpaceMono-Bold',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 32,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// RN'de CSS box-shadow yok — iOS shadow* + Android elevation ile yaklaşık eşdeğer.
export const shadow = {
  e1: Platform.select({
    ios: { shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 2 },
    default: {},
  }),
  e2: Platform.select({
    ios: { shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 6 },
    default: {},
  }),
} as const;
