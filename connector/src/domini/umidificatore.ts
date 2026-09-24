import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { accendi, acceso, accesoSe, cursoreUmidita, elenco, fra, has, metti, numeric, scelta, servizio } from './comune.js';
import type { Dominio } from './tipo.js';

/** Un umidificatore: acceso, quanta umidità, in che modo, e quanta ce n'è davvero. */

const MODI = 1;

export const umidificatore: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { entity } = ctx;
    const disponibili = elenco(entity, 'available_modes');
    return [
      acceso,
      cursoreUmidita(entity, { min: 30, max: 80 }),
      ...(has(entity, MODI) && disponibili ? [scelta(ctx, 'mode', 'Modo', disponibili, 'mode')] : []),
      ...(entity.attributes.current_humidity !== undefined
        ? [{ code: 'current', kind: 'sensor', label: 'In stanza', unit: '%' } as Capability]
        : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'power', accesoSe(entity.state));
    metti(state, 'humidity', numeric(entity.attributes.humidity));
    metti(state, 'mode', fra(entity.attributes.mode, elenco(entity, 'available_modes')));
    metti(state, 'current', numeric(entity.attributes.current_humidity));
    return state;
  },
  comandi: {
    power: accendi,
    humidity: servizio('humidifier', 'set_humidity', (valore) => ({ humidity: Number(valore) })),
    mode: servizio('humidifier', 'set_mode', (valore) => ({ mode: String(valore) })),
  },
};
