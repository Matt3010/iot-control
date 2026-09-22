import type { Capability, DeviceSnapshot, DeviceValue } from '../../shared/protocol.js';
import type { HaEntity } from './homeassistant.js';

/**
 * Da un'entità di Home Assistant a quello che il backend sa disegnare. È
 * l'unico punto del progetto dove esiste una parola di domotica: di qua in poi
 * sono interruttori, cursori e numeri.
 */

/** Quello che ci interessa. Il resto di HA — automazioni, script, scene — non è un dispositivo. */
const DOMAINS = new Set(['light', 'switch', 'input_boolean', 'fan', 'cover', 'climate', 'sensor', 'binary_sensor']);

/** I bit con cui HA dice cosa sa fare una tapparella o un ventilatore. */
const COVER_SET_POSITION = 4;
const COVER_STOP = 8;
const FAN_SET_SPEED = 1;
const CLIMATE_TARGET_TEMPERATURE = 1;

const domainOf = (entityId: string): string => entityId.split('.')[0] ?? '';
const features = (entity: HaEntity): number => Number(entity.attributes.supported_features ?? 0);
const has = (entity: HaEntity, bit: number): boolean => (features(entity) & bit) === bit;

const percent = (label: string, code: string): Capability => ({ code, kind: 'range', label, min: 0, max: 100, step: 1, unit: '%' });

/** Una luce che sa solo accendersi non ha un cursore da mostrare. */
function dimmable(entity: HaEntity): boolean {
  const modes = entity.attributes.supported_color_modes;
  if (!Array.isArray(modes)) return false;
  return modes.some((mode) => mode !== 'onoff' && mode !== 'unknown');
}

export function capabilitiesOf(entity: HaEntity): Capability[] {
  const domain = domainOf(entity.entity_id);
  const acceso: Capability = { code: 'power', kind: 'switch', label: 'Acceso' };

  switch (domain) {
    case 'switch':
    case 'input_boolean':
      return [acceso];

    case 'light':
      return dimmable(entity) ? [acceso, percent('Luminosità', 'brightness')] : [acceso];

    case 'fan':
      return has(entity, FAN_SET_SPEED) ? [acceso, percent('Velocità', 'speed')] : [acceso];

    case 'cover': {
      const move: Capability = { code: 'move', kind: 'enum', label: 'Movimento', values: has(entity, COVER_STOP) ? ['open', 'stop', 'close'] : ['open', 'close'] };
      return has(entity, COVER_SET_POSITION) ? [move, percent('Apertura', 'position')] : [move];
    }

    case 'climate': {
      const min = Number(entity.attributes.min_temp ?? 5);
      const max = Number(entity.attributes.max_temp ?? 35);
      const step = Number(entity.attributes.target_temp_step ?? 0.5);
      const temperatura: Capability = { code: 'temperature', kind: 'range', label: 'Temperatura', min, max, step, unit: '°C' };
      return has(entity, CLIMATE_TARGET_TEMPERATURE) ? [acceso, temperatura] : [acceso];
    }

    case 'sensor':
    case 'binary_sensor': {
      const unit = entity.attributes.unit_of_measurement as string | undefined;
      // Un sensore senza unità e senza tipo non è una misura: è un dettaglio
      // interno dell'integrazione — «Mansarda Action», che vale 0 e non vuol
      // dire niente. Su una mappa è rumore.
      if (!unit && !entity.attributes.device_class) return [];
      return [{ code: 'value', kind: 'sensor', label: 'Valore', ...(unit ? { unit } : {}) }];
    }

    default:
      return [];
  }
}

/** Un numero resta un numero; quello che non lo è resta la sua parola. */
const numeric = (value: unknown): DeviceValue | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function stateOf(entity: HaEntity): Record<string, DeviceValue> {
  const domain = domainOf(entity.entity_id);
  const state: Record<string, DeviceValue> = {};

  if (domain === 'sensor' || domain === 'binary_sensor') {
    state.value = numeric(entity.state) ?? entity.state;
    return state;
  }

  state.power = entity.state === 'on' || entity.state === 'open' || entity.state === 'heat' || entity.state === 'cool' || entity.state === 'auto';

  // HA tiene la luminosità su 255; fuori di qui si ragiona in percentuale.
  const brightness = numeric(entity.attributes.brightness);
  if (brightness !== undefined) state.brightness = Math.round((Number(brightness) / 255) * 100);

  const speed = numeric(entity.attributes.percentage);
  if (speed !== undefined) state.speed = speed;

  const position = numeric(entity.attributes.current_position);
  if (position !== undefined) state.position = position;

  const temperature = numeric(entity.attributes.temperature);
  if (temperature !== undefined) state.temperature = temperature;

  return state;
}

/**
 * Irraggiungibile è una cosa sola: `unavailable`, cioè Home Assistant non lo
 * sente. `unknown` è un'altra — il dispositivo c'è e risponde, ma non ha
 * ancora detto a che punto è. Una tapparella che nessuno ha mosso da quando
 * HA si è acceso sta così, e chiamarla irraggiungibile è una bugia: si può
 * comandare benissimo.
 */
export const isOnline = (entity: HaEntity): boolean => entity.state !== 'unavailable';

export function translate(entity: HaEntity): DeviceSnapshot | null {
  if (!DOMAINS.has(domainOf(entity.entity_id))) return null;
  // Un'entità nascosta in HA è nascosta per un motivo: la si rispetta.
  if (entity.attributes.hidden_by) return null;

  const capabilities = capabilitiesOf(entity);
  if (!capabilities.length) return null;

  return {
    externalId: entity.entity_id,
    name: (entity.attributes.friendly_name as string | undefined) ?? entity.entity_id,
    online: isOnline(entity),
    capabilities,
    state: stateOf(entity),
  };
}

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/**
 * Un comando che scende diventa una chiamata di servizio. `homeassistant.turn_on`
 * vale per ogni dominio, quindi accendere qualsiasi cosa è una riga sola.
 */
export function toServiceCall(entityId: string, code: string, value: DeviceValue): ServiceCall | null {
  const domain = domainOf(entityId);

  switch (code) {
    case 'power':
      return { domain: 'homeassistant', service: value ? 'turn_on' : 'turn_off', data: {} };

    case 'brightness':
      return { domain: 'light', service: 'turn_on', data: { brightness_pct: Number(value) } };

    case 'speed':
      return { domain: 'fan', service: 'set_percentage', data: { percentage: Number(value) } };

    case 'position':
      return { domain: 'cover', service: 'set_cover_position', data: { position: Number(value) } };

    case 'temperature':
      return { domain: 'climate', service: 'set_temperature', data: { temperature: Number(value) } };

    case 'move': {
      const service = value === 'open' ? 'open_cover' : value === 'close' ? 'close_cover' : 'stop_cover';
      return domain === 'cover' ? { domain: 'cover', service, data: {} } : null;
    }

    default:
      return null;
  }
}
