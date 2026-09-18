export const DEFAULT_PALETTE_ID = 'neon';

const PALETTE_KEYS = [
  'bg',
  'surface',
  'border',
  'primary',
  'accent',
  'danger',
  'success',
  'warning',
  'text',
  'muted',
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

export interface Palette {
  id: string;
  name: string;
  variant: 'default' | 'custom';
  locked?: boolean;
  colors: { [K in PaletteKey]: string };
}

export const PALETTES: Palette[] = [
  {
    id: 'neon',
    name: 'Neon',
    variant: 'default',
    colors: {
      bg: '10 14 39',
      surface: '20 25 51',
      border: '30 41 59',
      primary: '0 217 255',
      accent: '176 38 255',
      danger: '255 51 102',
      success: '0 255 136',
      warning: '251 191 36',
      text: '228 228 231',
      muted: '113 113 122',
    },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    variant: 'default',
    colors: {
      bg: '26 8 12',
      surface: '38 12 18',
      border: '72 20 30',
      primary: '255 77 90',
      accent: '200 48 150',
      danger: '255 59 72',
      success: '52 211 153',
      warning: '255 183 64',
      text: '236 218 220',
      muted: '145 120 125',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    variant: 'default',
    colors: {
      bg: '6 20 14',
      surface: '12 32 22',
      border: '24 57 40',
      primary: '52 211 153',
      accent: '45 212 191',
      danger: '248 113 113',
      success: '16 185 129',
      warning: '251 191 36',
      text: '220 232 226',
      muted: '110 132 122',
    },
  },
  {
    id: 'gold',
    name: 'Gold',
    variant: 'default',
    colors: {
      bg: '20 16 8',
      surface: '32 26 13',
      border: '60 48 22',
      primary: '250 204 21',
      accent: '251 146 60',
      danger: '248 113 113',
      success: '74 222 128',
      warning: '251 191 36',
      text: '233 226 210',
      muted: '140 130 110',
    },
  },
  {
    id: 'ice',
    name: 'Ice',
    variant: 'default',
    colors: {
      bg: '8 15 28',
      surface: '15 25 44',
      border: '30 46 70',
      primary: '96 165 250',
      accent: '129 140 248',
      danger: '248 113 113',
      success: '74 222 128',
      warning: '251 191 36',
      text: '226 232 240',
      muted: '122 136 155',
    },
  },
];

export function applyPalette(palette: Palette): void {
  const root = document.documentElement.style;
  for (const key of PALETTE_KEYS) {
    root.setProperty(`--frag-${key}`, palette.colors[key]);
  }
}

export function applyPaletteById(id: string): void {
  const palette = PALETTES.find((p) => p.id === id);
  applyPalette(palette ?? PALETTES[0]);
}

export function getPaletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}