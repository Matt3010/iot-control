import type { DeviceValue } from '../../../shared/protocol.js';
import { adesso, fra, metti, ordina, ordini, type Ordine } from './comune.js';
import type { Dominio } from './tipo.js';

/**
 * Una serratura non è un interruttore: «acceso» non vuol dire niente, e le
 * parole devono essere quelle che useresti a voce. «Apri la porta» c'è solo
 * se sa aprire lo scrocco, che è un'altra cosa rispetto a togliere la mandata.
 */

const LOCK_OPEN = 1;

const ORDINI: Ordine[] = [
  { voce: 'Apri', servizio: 'unlock', stato: 'unlocked', detto: { se: 'aperto', quando: 'si apre' } },
  { voce: 'Chiudi a chiave', servizio: 'lock', stato: 'locked', detto: { se: 'chiuso a chiave', quando: 'si chiude a chiave' } },
  { voce: 'Apri la porta', servizio: 'open', bit: LOCK_OPEN, stato: 'open' },
];

/** Gli stati che la centrale conosce per una serratura; come si leggono lo dice lei (`vociDi`). */
const STATI = ['locked', 'unlocked', 'open', 'opening', 'locking', 'unlocking', 'jammed'];

export const serratura: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { voci, detti } = ordini(ctx.entity, ORDINI);
    return [
      { code: 'lock', kind: 'enum', label: 'Serratura', values: voci, ...(detti ? { detti } : {}) },
      // anche inceppata, o mentre si muove
      adesso(ctx, STATI),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    // bloccata a metà, inceppata, che si sta muovendo: non è né aperta né chiusa, e lo dice lo stato a parole
    metti(state, 'lock', ordini(entity, ORDINI).voceDi(entity.state));
    metti(state, 'status', fra(entity.state, STATI));
    return state;
  },
  comandi: { lock: ordina('lock', ORDINI) },
};
