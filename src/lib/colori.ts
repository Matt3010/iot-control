/**
 * I colori con un nome, per scegliere una luce in una scena e per dirla.
 *
 * Una tinta è un numero sul cerchio, da 0 a 360, e «imposta il colore a 230»
 * non lo legge nessuno. In una scena si sceglie per nome, e un numero
 * qualunque si dice con il nome più vicino. La stessa tavola la usa il
 * server per il registro (server/src/managers/says.ts).
 */
export const COLORI: readonly { tinta: number; nome: string }[] = [
  { tinta: 0, nome: 'Rosso' },
  { tinta: 30, nome: 'Arancione' },
  { tinta: 55, nome: 'Giallo' },
  { tinta: 120, nome: 'Verde' },
  { tinta: 190, nome: 'Azzurro' },
  { tinta: 230, nome: 'Blu' },
  { tinta: 280, nome: 'Viola' },
  { tinta: 320, nome: 'Rosa' },
];

/** Il nome del colore più vicino a quella tinta. Il rosso sta a tutti e due i capi. */
export function nomeColore(tinta: number): string {
  const giro = ((tinta % 360) + 360) % 360;
  const distanza = (a: number): number => Math.min(Math.abs(a - giro), 360 - Math.abs(a - giro));
  return COLORI.reduce((meglio, uno) => (distanza(uno.tinta) < distanza(meglio.tinta) ? uno : meglio)).nome;
}
