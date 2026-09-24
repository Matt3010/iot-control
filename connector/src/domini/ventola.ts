import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { accendi, acceso, accesoSe, elenco, fra, has, metti, numeric, percent, scelta, servizio } from './comune.js';
import type { Dominio } from './tipo.js';

/** Un ventilatore: acceso, quanto forte, con che profilo, se gira, in che verso. */

const FAN = { SET_SPEED: 1, OSCILLATE: 2, DIRECTION: 4, PRESET_MODE: 8 } as const;

/** La direzione di un ventilatore, con le parole che si scrivono e quelle che capisce lui. */
const DIREZIONI: Record<string, string> = { Avanti: 'forward', Indietro: 'reverse' };

export const ventola: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { entity } = ctx;
    const profili = elenco(entity, 'preset_modes');
    return [
      acceso,
      ...(has(entity, FAN.SET_SPEED) ? [{ ...percent('Velocità', 'speed'), accende: 'power' } as Capability] : []),
      ...(has(entity, FAN.PRESET_MODE) && profili ? [scelta(ctx, 'preset', 'Profilo', profili, 'preset_mode')] : []),
      ...(has(entity, FAN.OSCILLATE) ? [{ code: 'oscillate', kind: 'switch', label: 'Oscillazione' } as Capability] : []),
      ...(has(entity, FAN.DIRECTION)
        ? [{ code: 'direction', kind: 'enum', label: 'Direzione', values: Object.keys(DIREZIONI) } as Capability]
        : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'power', accesoSe(entity.state));
    metti(state, 'speed', numeric(entity.attributes.percentage));
    metti(state, 'preset', fra(entity.attributes.preset_mode, elenco(entity, 'preset_modes')));
    if (typeof entity.attributes.oscillating === 'boolean') state.oscillate = entity.attributes.oscillating;
    metti(state, 'direction', Object.keys(DIREZIONI).find((voce) => DIREZIONI[voce] === entity.attributes.direction));
    return state;
  },
  comandi: {
    power: accendi,
    speed: servizio('fan', 'set_percentage', (valore) => ({ percentage: Number(valore) })),
    preset: servizio('fan', 'set_preset_mode', (valore) => ({ preset_mode: String(valore) })),
    oscillate: servizio('fan', 'oscillate', (valore) => ({ oscillating: Boolean(valore) })),
    direction: (_ctx, valore) => {
      const direction = DIREZIONI[String(valore)];
      return direction ? { domain: 'fan', service: 'set_direction', data: { direction } } : null;
    },
  },
};
