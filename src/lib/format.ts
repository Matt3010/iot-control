export const formatDistance = (metres: number): string =>
  metres < 950
    ? `${Math.round(metres / 10) * 10} m`
    : `${(metres / 1000).toFixed(metres < 9500 ? 1 : 0)} km`;

/** Accent-insensitive, case-insensitive: what search should compare. */
export const normalise = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Ten families across, four shades down: the grid reads as a spectrum, and any
 * row of it stays legible as a pin on both the light and the dark basemap.
 */
export const COLORS = [
  // chiari
  '#ff8f85', '#ffb273', '#ffd47a', '#9be59f', '#86e3d7',
  '#8ec5ff', '#c3a6ff', '#ffa3c8', '#dbb894', '#c3cad3',
  // medi
  '#f2564d', '#f5883c', '#f7b32b', '#5bc763', '#34c4b0',
  '#4a9bff', '#8f7aef', '#f2688f', '#b98b5e', '#8b94a3',
  // pieni
  '#d7263d', '#e4572e', '#d99400', '#2f9e44', '#00a6a6',
  '#2f6fed', '#6a4c93', '#d6336c', '#8d6a4f', '#5c6672',
  // scuri
  '#98182c', '#ab3c19', '#9c6a00', '#1f6b30', '#0c7176',
  '#1c4aa8', '#46316b', '#98164a', '#5f4633', '#333c47',
] as const;

/** The full row: what a new category is offered, one after the other. */
export const SUGGESTED = COLORS.slice(20, 30);

/**
 * Il segno di una categoria appena nata.
 *
 * Sta nel catalogo dei segni insieme a tutti gli altri, e da qui si ripassa
 * soltanto, perché era scritto anche lì e due volte lo stesso valore vuol
 * dire che un giorno uno dei due cambia da solo.
 */
export { DEFAULT_MARK } from './marks';
