import type { Dominio } from './tipo.js';

/**
 * Una telecamera non si accende e non si spegne da qui: si guarda. Il
 * fotogramma non sta fra i valori perché non è una cosa che il dispositivo
 * sa fare, è quello che il dispositivo è; e chi deve sapere se una cosa è
 * una telecamera lo chiede alla capacità `image`, non al nome del dominio.
 */
export const camera: Dominio = {
  ruolo: 'principale',
  capacita: () => [{ code: 'frame', kind: 'image', label: 'Immagine' }],
  stato: () => ({}),
  comandi: {},
};
