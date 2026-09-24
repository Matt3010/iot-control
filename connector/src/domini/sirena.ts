import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { HaEntity } from '../homeassistant.js';
import { acceso, accesoSe, has, metti, percent } from './comune.js';
import type { Dominio } from './tipo.js';

/**
 * Una sirena si accende; tono, volume e durata sono come suonerà la prossima
 * volta. Una sirena non li ricorda: si dicono quando la si accende. Li tiene
 * l'agente come preferenze (entities.ts, in un file suo), e li manda con
 * l'accensione.
 */

const SIREN = { TONES: 4, VOLUME_SET: 8, DURATION: 16 } as const;

/** I toni di una sirena: un elenco di nomi, o i nomi con la loro etichetta. */
function toni(entity: HaEntity): { values: string[]; labels?: Record<string, string> } | undefined {
  const detti = entity.attributes.available_tones;
  if (Array.isArray(detti) && detti.length) return { values: detti.map(String) };
  if (detti && typeof detti === 'object' && Object.keys(detti).length) {
    const labels = Object.fromEntries(Object.entries(detti as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    return { values: Object.keys(labels), labels };
  }
  return undefined;
}

export const sirena: Dominio = {
  ruolo: 'principale',
  capacita({ entity }) {
    const suoni = has(entity, SIREN.TONES) ? toni(entity) : undefined;
    return [
      acceso,
      ...(suoni ? [{ code: 'tone', kind: 'enum', label: 'Suono', ...suoni, setting: true } as Capability] : []),
      ...(has(entity, SIREN.VOLUME_SET) ? [{ ...percent('Volume', 'volume'), setting: true }] : []),
      ...(has(entity, SIREN.DURATION)
        ? [{ code: 'duration', kind: 'range', label: 'Durata', min: 1, max: 600, step: 1, unit: 's', setting: true } as Capability]
        : []),
    ];
  },
  stato({ entity, preferenze }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'power', accesoSe(entity.state));
    return Object.assign(state, preferenze);
  },
  comandi: {
    // una sirena suona come le si è detto l'ultima volta
    power: ({ preferenze }, valore) => {
      if (!valore) return { domain: 'homeassistant', service: 'turn_off', data: {} };
      const data: Record<string, unknown> = {};
      if (preferenze.tone !== undefined) data.tone = preferenze.tone;
      if (preferenze.volume !== undefined) data.volume_level = Number(preferenze.volume) / 100;
      if (preferenze.duration !== undefined) data.duration = Number(preferenze.duration);
      return { domain: 'siren', service: 'turn_on', data };
    },
    tone: (_ctx, valore) => ({ preferenza: { tone: String(valore) } }),
    volume: (_ctx, valore) => ({ preferenza: { volume: Number(valore) } }),
    duration: (_ctx, valore) => ({ preferenza: { duration: Number(valore) } }),
  },
};
