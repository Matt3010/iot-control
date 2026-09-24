import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { accendi, acceso, accesoSe, cursoreTemperatura, elenco, fra, has, ignota, metti, numeric, scelta, servizio } from './comune.js';
import { gradi } from './lingua.js';
import type { Dominio } from './tipo.js';

/** Uno scaldabagno: acceso, quanti gradi, in che modo, e se siamo fuori casa. */

const WATER_HEATER = { TARGET_TEMPERATURE: 1, OPERATION_MODE: 2, AWAY_MODE: 4, ON_OFF: 8 } as const;

export const scaldabagno: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { entity } = ctx;
    const disponibili = elenco(entity, 'operation_list');
    return [
      ...(has(entity, WATER_HEATER.ON_OFF) ? [acceso] : []),
      ...(has(entity, WATER_HEATER.TARGET_TEMPERATURE) ? [cursoreTemperatura(entity, 'temperature', 'Temperatura', { min: 30, max: 70, step: 1 })] : []),
      ...(has(entity, WATER_HEATER.OPERATION_MODE) && disponibili ? [scelta(ctx, 'mode', 'Modo', disponibili)] : []),
      ...(has(entity, WATER_HEATER.AWAY_MODE) ? [{ code: 'away', kind: 'switch', label: 'Fuori casa' } as Capability] : []),
      ...(entity.attributes.current_temperature !== undefined
        ? [{ code: 'current', kind: 'sensor', label: 'Adesso', unit: gradi } as Capability]
        : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    // lo stato di uno scaldabagno è il suo modo: spento è «off», il resto è acceso
    if (!ignota(entity.state)) state.power = entity.state !== 'off';
    metti(state, 'temperature', numeric(entity.attributes.temperature));
    metti(state, 'mode', fra(entity.attributes.operation_mode, elenco(entity, 'operation_list')));
    metti(state, 'away', accesoSe(String(entity.attributes.away_mode ?? '')));
    metti(state, 'current', numeric(entity.attributes.current_temperature));
    return state;
  },
  comandi: {
    power: accendi,
    temperature: servizio('water_heater', 'set_temperature', (valore) => ({ temperature: Number(valore) })),
    mode: servizio('water_heater', 'set_operation_mode', (valore) => ({ operation_mode: String(valore) })),
    away: servizio('water_heater', 'set_away_mode', (valore) => ({ away_mode: Boolean(valore) })),
  },
};
