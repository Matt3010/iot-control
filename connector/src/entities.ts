import type { Capability, DeviceSnapshot, DeviceValue } from '../../shared/protocol.js';
import type { HaEntity } from './homeassistant.js';

/**
 * Da un'entità di Home Assistant a quello che il backend sa disegnare. È
 * l'unico punto del progetto dove esiste una parola di domotica: di qua in poi
 * sono interruttori, cursori e numeri.
 */

/** Quello che ci interessa. Il resto di HA — automazioni, script, scene — non è un dispositivo. */
const DOMAINS = new Set([
  'light',
  'switch',
  'input_boolean',
  'fan',
  'cover',
  'climate',
  'lock',
  'sensor',
  'binary_sensor',
]);

/** I bit con cui HA dice cosa sa fare una tapparella o un ventilatore. */
const COVER_SET_POSITION = 4;
const COVER_STOP = 8;
const FAN_SET_SPEED = 1;
const CLIMATE_TARGET_TEMPERATURE = 1;

const domainOf = (entityId: string): string => entityId.split('.')[0] ?? '';
const features = (entity: HaEntity): number => Number(entity.attributes.supported_features ?? 0);
const has = (entity: HaEntity, bit: number): boolean => (features(entity) & bit) === bit;

const percent = (label: string, code: string): Capability => ({ code, kind: 'range', label, min: 0, max: 100, step: 1, unit: '%' });

/**
 * Cosa misura un sensore, detto in italiano. Home Assistant lo sa — lo chiama
 * `device_class` — e «Temperatura» dice molto più di «Valore».
 */
const MEASURES: Record<string, string> = {
  temperature: 'Temperatura',
  humidity: 'Umidità',
  power: 'Potenza',
  energy: 'Consumo',
  current: 'Corrente',
  voltage: 'Tensione',
  illuminance: 'Luce',
  battery: 'Batteria',
  pressure: 'Pressione',
  co2: 'Anidride carbonica',
  pm25: 'Polveri sottili',
  signal_strength: 'Segnale',
  motion: 'Movimento',
  door: 'Porta',
  window: 'Finestra',
  smoke: 'Fumo',
  moisture: 'Acqua',
};

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
      // in italiano, e con le parole che si usano per una tapparella
      const move: Capability = {
        code: 'move',
        kind: 'enum',
        label: 'Movimento',
        values: has(entity, COVER_STOP) ? ['Apri', 'Ferma', 'Chiudi'] : ['Apri', 'Chiudi'],
      };
      return has(entity, COVER_SET_POSITION) ? [move, percent('Apertura', 'position')] : [move];
    }

    case 'lock':
      // una serratura non è un interruttore: «acceso» non vuol dire niente,
      // e le due parole devono essere quelle che useresti a voce
      return [{ code: 'lock', kind: 'enum', label: 'Serratura', values: ['Apri', 'Chiudi a chiave'] }];

    case 'climate': {
      const min = Number(entity.attributes.min_temp ?? 5);
      const max = Number(entity.attributes.max_temp ?? 35);
      const step = Number(entity.attributes.target_temp_step ?? 0.5);
      const temperatura: Capability = { code: 'temperature', kind: 'range', label: 'Temperatura', min, max, step, unit: '°C' };

      // i modi che quel condizionatore sa fare davvero, senza «off» che è già
      // l'interruttore qui sopra
      const modi = (entity.attributes.hvac_modes as string[] | undefined)?.filter((mode) => mode !== 'off');
      const modo: Capability | null =
        modi && modi.length > 1 ? { code: 'mode', kind: 'enum', label: 'Modo', values: modi } : null;

      return [acceso, ...(has(entity, CLIMATE_TARGET_TEMPERATURE) ? [temperatura] : []), ...(modo ? [modo] : [])];
    }

    case 'sensor':
    case 'binary_sensor': {
      const unit = entity.attributes.unit_of_measurement as string | undefined;
      const measure = entity.attributes.device_class as string | undefined;
      // Un sensore senza unità e senza tipo non è una misura: è un dettaglio
      // interno dell'integrazione — «Mansarda Action», che vale 0 e non vuol
      // dire niente. Su una mappa è rumore.
      if (!unit && !measure) return [];
      const label = (measure && MEASURES[measure]) || 'Valore';
      return [{ code: 'value', kind: 'sensor', label, ...(unit ? { unit } : {}) }];
    }

    default:
      return [];
  }
}

/**
 * Un sensore a due stati dice `on`/`off`, che è la lingua delle macchine.
 * Le parole giuste dipendono da cosa guarda: una porta è aperta o chiusa,
 * un rilevatore vede qualcosa o non vede niente.
 */
const WORDS: Record<string, [string, string]> = {
  motion: ['Rilevato', 'Niente'],
  occupancy: ['Qualcuno', 'Nessuno'],
  door: ['Aperta', 'Chiusa'],
  window: ['Aperta', 'Chiusa'],
  opening: ['Aperto', 'Chiuso'],
  garage_door: ['Aperto', 'Chiuso'],
  moisture: ['Bagnato', 'Asciutto'],
  smoke: ['Fumo', 'Pulito'],
  gas: ['Gas', 'Pulito'],
  problem: ['Problema', 'A posto'],
  battery: ['Scarica', 'Carica'],
  lock: ['Aperta', 'Chiusa'],
  presence: ['In casa', 'Fuori'],
};

/** Un numero resta un numero; quello che non lo è resta la sua parola. */
const numeric = (value: unknown): DeviceValue | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function stateOf(entity: HaEntity): Record<string, DeviceValue> {
  const domain = domainOf(entity.entity_id);
  const state: Record<string, DeviceValue> = {};

  if (domain === 'binary_sensor') {
    const words = WORDS[String(entity.attributes.device_class ?? '')] ?? ['Sì', 'No'];
    state.value = entity.state === 'on' ? words[0] : entity.state === 'off' ? words[1] : '—';
    return state;
  }

  if (domain === 'sensor') {
    state.value = numeric(entity.state) ?? entity.state;
    return state;
  }

  // Una tapparella aperta non è «accesa»: non consuma e non si è dimenticata
  // niente. Se contasse, il pin sulla mappa si scalderebbe per una tenda
  // tirata su, che non è quello che vuoi sapere da lontano.
  if (domain === 'cover') {
    if (entity.state === 'open') state.move = 'Apri';
    else if (entity.state === 'closed') state.move = 'Chiudi';
  } else if (domain === 'lock') {
    state.lock = entity.state === 'locked' ? 'Chiudi a chiave' : 'Apri';
  } else if (domain === 'climate') {
    // un condizionatore acceso può essere in deumidificazione o ventilazione:
    // «diverso da spento» è l'unica regola che non lascia fuori nessuno
    state.power = entity.state !== 'off' && entity.state !== 'unavailable';
    state.mode = entity.state;
  } else {
    state.power = entity.state === 'on';
  }

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

    case 'lock':
      return domain === 'lock'
        ? { domain: 'lock', service: value === 'Apri' ? 'unlock' : 'lock', data: {} }
        : null;

    case 'mode':
      return domain === 'climate'
        ? { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: String(value) } }
        : null;

    case 'move': {
      const service = value === 'Apri' ? 'open_cover' : value === 'Chiudi' ? 'close_cover' : 'stop_cover';
      return domain === 'cover' ? { domain: 'cover', service, data: {} } : null;
    }

    default:
      return null;
  }
}
