import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { HaEntity } from '../homeassistant.js';
import { adesso, elenco, fra, has, metti, numeric, ordina, ordini, scelta, servizio, tasti, type Ordine } from './comune.js';
import type { Dominio } from './tipo.js';

/**
 * Aspirapolvere e tosaerba: un robot che parte, si ferma e torna alla base.
 * Stanno insieme perché si leggono allo stesso modo — gli ordini, come sta
 * adesso, la batteria — e cambiano solo le parole e i servizi.
 */

const VACUUM = { PAUSE: 4, STOP: 8, RETURN_HOME: 16, FAN_SPEED: 32, BATTERY: 64, LOCATE: 512, START: 8192 } as const;
const MOWER = { START: 1, PAUSE: 2, DOCK: 4 } as const;

const ASPIRAPOLVERE: Ordine[] = [
  { voce: 'Avvia', servizio: 'start', bit: VACUUM.START },
  { voce: 'Pausa', servizio: 'pause', bit: VACUUM.PAUSE },
  { voce: 'Fermati', servizio: 'stop', bit: VACUUM.STOP },
  { voce: 'Torna alla base', servizio: 'return_to_base', bit: VACUUM.RETURN_HOME },
  { voce: 'Trova', servizio: 'locate', bit: VACUUM.LOCATE },
];
const TOSAERBA: Ordine[] = [
  { voce: 'Avvia', servizio: 'start_mowing', bit: MOWER.START },
  { voce: 'Pausa', servizio: 'pause', bit: MOWER.PAUSE },
  { voce: 'Torna alla base', servizio: 'dock', bit: MOWER.DOCK },
];

/** Gli stati che la centrale conosce per ognuno; come si leggono lo dice lei (`vociDi`). */
const STATI_ASPIRAPOLVERE = ['cleaning', 'docked', 'returning', 'paused', 'idle', 'error'];
const STATI_TOSAERBA = ['mowing', 'docked', 'returning', 'paused', 'error'];

/** Come sta un robot: la centrale nuova lo dice in `activity`, quella di prima nello stato. */
const comeSta = (entity: HaEntity, stati: string[]): string | undefined => fra(String(entity.attributes.activity ?? entity.state), stati);

export const aspirapolvere: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { entity } = ctx;
    const aspirazioni = elenco(entity, 'fan_speed_list');
    return [
      ...tasti('vacuum', 'Pulizia', ordini(entity, ASPIRAPOLVERE).voci),
      ...(has(entity, VACUUM.FAN_SPEED) && aspirazioni ? [scelta(ctx, 'fan_speed', 'Aspirazione', aspirazioni, 'fan_speed')] : []),
      adesso(ctx, STATI_ASPIRAPOLVERE),
      ...(has(entity, VACUUM.BATTERY) ? [{ code: 'battery', kind: 'sensor', label: 'Batteria', unit: '%' } as Capability] : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'status', comeSta(entity, STATI_ASPIRAPOLVERE));
    metti(state, 'battery', numeric(entity.attributes.battery_level));
    metti(state, 'fan_speed', fra(entity.attributes.fan_speed, elenco(entity, 'fan_speed_list')));
    return state;
  },
  comandi: {
    vacuum: ordina('vacuum', ASPIRAPOLVERE),
    fan_speed: servizio('vacuum', 'set_fan_speed', (valore) => ({ fan_speed: String(valore) })),
  },
};

export const tosaerba: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    return [...tasti('mower', 'Taglio', ordini(ctx.entity, TOSAERBA).voci), adesso(ctx, STATI_TOSAERBA)];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'status', comeSta(entity, STATI_TOSAERBA));
    return state;
  },
  comandi: { mower: ordina('lawn_mower', TOSAERBA) },
};
