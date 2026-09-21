export const formatDistance = (metres: number): string =>
  metres < 950
    ? `${Math.round(metres / 10) * 10} m`
    : `${(metres / 1000).toFixed(metres < 9500 ? 1 : 0)} km`;

/** Accent-insensitive, case-insensitive: what search should compare. */
export const normalise = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Sixteen colours that stay apart from each other on a map, light or dark. */
export const COLORS = [
  '#e4572e', '#f3a712', '#d7263d', '#f26d85',
  '#b5179e', '#6a4c93', '#3a86ff', '#2274a5',
  '#00a6a6', '#2a9d8f', '#43aa8b', '#7cb518',
  '#8d6a4f', '#e07a5f', '#5c6672', '#264653',
] as const;

export const DEFAULT_EMOJI = '📍';
