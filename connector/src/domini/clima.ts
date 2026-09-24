import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { HaEntity } from '../homeassistant.js';
import { acceso, cursoreTemperatura, cursoreUmidita, elenco, fra, has, ignota, metti, numeric, scelta, servizio } from './comune.js';
import { gradi } from './lingua.js';
import type { Comando, ContestoComando, Dominio } from './tipo.js';

/**
 * Un condizionatore, un termostato, una pompa di calore: acceso, quanti
 * gradi, in che modo, con che ventola e che oscillazione, e quanti gradi ci
 * sono davvero.
 */

const CLIMATE = {
  TARGET_TEMPERATURE: 1,
  TARGET_TEMPERATURE_RANGE: 2,
  TARGET_HUMIDITY: 4,
  FAN_MODE: 8,
  PRESET_MODE: 16,
  SWING_MODE: 32,
  TURN_OFF: 128,
  TURN_ON: 256,
  SWING_HORIZONTAL_MODE: 512,
} as const;

/** I limiti di una soglia quando il condizionatore non li dice. */
const SOGLIA = { min: 5, max: 35, step: 0.5 };

/** I modi che quel condizionatore sa fare davvero, senza «off» che è l'interruttore. */
const modiAccesi = (entity: HaEntity): string[] => (elenco(entity, 'hvac_modes') ?? []).filter((mode) => mode !== 'off');

/**
 * Accendere o spegnere un condizionatore. Se sa farlo da sé si chiede a lui;
 * se no si passa dal modo: spento è il modo «off», e acceso è l'ultimo modo
 * in cui era, o il primo che sa fare.
 */
function accendiClima({ entity, ricordo }: ContestoComando, valore: DeviceValue): Comando {
  const accendere = Boolean(valore);
  const bit = accendere ? CLIMATE.TURN_ON : CLIMATE.TURN_OFF;
  if (!entity || has(entity, bit)) return { domain: 'climate', service: accendere ? 'turn_on' : 'turn_off', data: {} };
  if (!accendere) {
    return (elenco(entity, 'hvac_modes') ?? []).includes('off')
      ? { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: 'off' } }
      : { manca: 'Questo condizionatore non si spegne da qui, perché non ha un modo spento' };
  }
  const accesi = modiAccesi(entity);
  const ultimo = ricordo.mode;
  const modo = typeof ultimo === 'string' && accesi.includes(ultimo) ? ultimo : accesi[0];
  return modo
    ? { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: modo } }
    : { manca: 'Questo condizionatore non dice in che modo accendersi' };
}

/**
 * Le due soglie di un clima si scrivono insieme, e quella che non si tocca
 * resta com'è. Se lo stato di adesso non la dice — in un modo che ne usa una
 * sola la centrale le toglie — si prende l'ultima conosciuta, o la
 * temperatura singola.
 */
const soglia =
  (code: 'temp_low' | 'temp_high') =>
  ({ entity, ricordo }: ContestoComando, value: DeviceValue): Comando => {
    const altra = (chiave: 'temp_low' | 'temp_high', attributo: string): number | undefined => {
      const valore =
        numeric(entity?.attributes[attributo]) ?? numeric(ricordo[chiave]) ?? numeric(entity?.attributes.temperature) ?? numeric(ricordo.temperature);
      return valore === undefined ? undefined : Number(valore);
    };
    const bassa = code === 'temp_low' ? Number(value) : altra('temp_low', 'target_temp_low');
    const alta = code === 'temp_high' ? Number(value) : altra('temp_high', 'target_temp_high');
    if (bassa === undefined || alta === undefined) {
      return {
        manca: `Non si sa ancora la temperatura ${code === 'temp_low' ? 'massima' : 'minima'}, e le due soglie si mandano insieme`,
      };
    }
    return { domain: 'climate', service: 'set_temperature', data: { target_temp_low: bassa, target_temp_high: alta } };
  };

export const clima: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { entity } = ctx;
    const cursore = (code: string, label: string): Capability => cursoreTemperatura(entity, code, label, SOGLIA);
    const modi = modiAccesi(entity);
    // si accende e si spegne se lo dice, o se fra i modi c'è «spento»: allora si passa da lì
    const accendibile = has(entity, CLIMATE.TURN_ON) || has(entity, CLIMATE.TURN_OFF) || (elenco(entity, 'hvac_modes') ?? []).includes('off');
    const ventole = elenco(entity, 'fan_modes');
    const profili = elenco(entity, 'preset_modes');
    const oscillazioni = elenco(entity, 'swing_modes');
    const orizzontali = elenco(entity, 'swing_horizontal_modes');
    return [
      ...(accendibile ? [acceso] : []),
      ...(has(entity, CLIMATE.TARGET_TEMPERATURE) ? [cursore('temperature', 'Temperatura')] : []),
      // chi tiene la stanza fra due soglie ne ha due, e si scrivono insieme
      ...(has(entity, CLIMATE.TARGET_TEMPERATURE_RANGE) ? [cursore('temp_low', 'Minima'), cursore('temp_high', 'Massima')] : []),
      ...(modi.length > 1 ? [scelta(ctx, 'mode', 'Modo', modi)] : []),
      ...(has(entity, CLIMATE.FAN_MODE) && ventole ? [scelta(ctx, 'fan_mode', 'Ventilatore', ventole, 'fan_mode')] : []),
      ...(has(entity, CLIMATE.SWING_MODE) && oscillazioni ? [scelta(ctx, 'swing', 'Oscillazione', oscillazioni, 'swing_mode')] : []),
      ...(has(entity, CLIMATE.SWING_HORIZONTAL_MODE) && orizzontali
        ? [scelta(ctx, 'swing_horizontal', 'Oscillazione orizzontale', orizzontali, 'swing_horizontal_mode')]
        : []),
      ...(has(entity, CLIMATE.PRESET_MODE) && profili ? [scelta(ctx, 'preset', 'Profilo', profili, 'preset_mode')] : []),
      ...(has(entity, CLIMATE.TARGET_HUMIDITY) ? [cursoreUmidita(entity, { min: 30, max: 99 })] : []),
      // quanti gradi ci sono davvero, accanto a quanti se ne chiedono
      ...(entity.attributes.current_temperature !== undefined
        ? [{ code: 'current', kind: 'sensor', label: 'In stanza', unit: gradi } as Capability]
        : []),
      ...(entity.attributes.current_humidity !== undefined
        ? [{ code: 'current_humidity', kind: 'sensor', label: 'Umidità in stanza', unit: '%' } as Capability]
        : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    // un condizionatore acceso può essere in deumidificazione o ventilazione:
    // «diverso da spento» è l'unica regola che non lascia fuori nessuno
    if (!ignota(entity.state)) state.power = entity.state !== 'off';
    metti(state, 'mode', fra(entity.state, modiAccesi(entity)));
    metti(state, 'current', numeric(entity.attributes.current_temperature));
    metti(state, 'current_humidity', numeric(entity.attributes.current_humidity));
    metti(state, 'temperature', numeric(entity.attributes.temperature));
    metti(state, 'temp_low', numeric(entity.attributes.target_temp_low));
    metti(state, 'temp_high', numeric(entity.attributes.target_temp_high));
    metti(state, 'humidity', numeric(entity.attributes.humidity));
    metti(state, 'fan_mode', fra(entity.attributes.fan_mode, elenco(entity, 'fan_modes')));
    metti(state, 'swing', fra(entity.attributes.swing_mode, elenco(entity, 'swing_modes')));
    metti(state, 'swing_horizontal', fra(entity.attributes.swing_horizontal_mode, elenco(entity, 'swing_horizontal_modes')));
    metti(state, 'preset', fra(entity.attributes.preset_mode, elenco(entity, 'preset_modes')));
    return state;
  },
  comandi: {
    power: accendiClima,
    temperature: servizio('climate', 'set_temperature', (valore) => ({ temperature: Number(valore) })),
    temp_low: soglia('temp_low'),
    temp_high: soglia('temp_high'),
    mode: servizio('climate', 'set_hvac_mode', (valore) => ({ hvac_mode: String(valore) })),
    fan_mode: servizio('climate', 'set_fan_mode', (valore) => ({ fan_mode: String(valore) })),
    swing: servizio('climate', 'set_swing_mode', (valore) => ({ swing_mode: String(valore) })),
    swing_horizontal: servizio('climate', 'set_swing_horizontal_mode', (valore) => ({ swing_horizontal_mode: String(valore) })),
    preset: servizio('climate', 'set_preset_mode', (valore) => ({ preset_mode: String(valore) })),
    humidity: servizio('climate', 'set_humidity', (valore) => ({ humidity: Number(valore) })),
  },
};
