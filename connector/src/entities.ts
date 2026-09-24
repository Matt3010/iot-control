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
  'camera',
  'event',
  'media_player',
  'button',
  'scene',
  'number',
  'select',
  'valve',
  'vacuum',
  'lawn_mower',
  'humidifier',
  'water_heater',
  'siren',
]);

/** I bit con cui HA dice cosa sa fare una tapparella o un ventilatore. */
const COVER_SET_POSITION = 4;
const COVER_STOP = 8;
const FAN_SET_SPEED = 1;
const CLIMATE_TARGET_TEMPERATURE = 1;
const CLIMATE_FAN_MODE = 8;
const CLIMATE_PRESET_MODE = 16;
const COVER_SET_TILT = 128;
const VALVE = { STOP: 8, SET_POSITION: 4 } as const;
const VACUUM = { PAUSE: 4, STOP: 8, RETURN_HOME: 16, START: 8192 } as const;
const MOWER = { START: 1, PAUSE: 2, DOCK: 4 } as const;
const HUMIDIFIER_MODES = 1;
const WATER_HEATER = { TARGET_TEMPERATURE: 1, OPERATION_MODE: 2, ON_OFF: 8 } as const;

/** Le parole per come sta un aspirapolvere o un tosaerba, dette in italiano. */
const LAVORI: Record<string, string> = {
  cleaning: 'pulisce',
  mowing: 'taglia',
  docked: 'alla base',
  returning: 'torna alla base',
  paused: 'in pausa',
  idle: 'fermo',
  error: 'in errore',
};

/**
 * Le voci più comuni dei modi di clima, ventilatori, umidificatori e
 * scaldabagni, dette in italiano. Il valore resta quello del dispositivo,
 * che è quello che si manda indietro; cambia solo come si legge.
 */
const MODI: Record<string, string> = {
  heat: 'Caldo',
  cool: 'Freddo',
  heat_cool: 'Automatico',
  auto: 'Automatico',
  dry: 'Deumidifica',
  fan_only: 'Solo ventola',
  low: 'Bassa',
  medium: 'Media',
  middle: 'Media',
  high: 'Alta',
  quiet: 'Silenziosa',
  eco: 'Eco',
  comfort: 'Comfort',
  away: 'Fuori casa',
  home: 'In casa',
  sleep: 'Notte',
  boost: 'Massima',
  normal: 'Normale',
  performance: 'Prestazioni',
  electric: 'Elettrico',
  gas: 'Gas',
  heat_pump: 'Pompa di calore',
  high_demand: 'Molta richiesta',
  baby: 'Bambini',
};

/** Le etichette italiane delle voci che il dizionario conosce, se ce n'è almeno una. */
const detteIn = (voci: string[]): Record<string, string> | undefined => {
  const dette = Object.fromEntries(voci.flatMap((voce) => (MODI[voce] ? [[voce, MODI[voce] as string]] : [])));
  return Object.keys(dette).length ? dette : undefined;
};

/** Un elenco di modi, con le voci dette in italiano. */
const modi = (code: string, label: string, values: string[]): Capability => {
  const labels = detteIn(values);
  return { code, kind: 'enum', label, values, ...(labels ? { labels } : {}) };
};

/** Un numero da un attributo, con il suo ripiego. */
const attr = (entity: HaEntity, nome: string, ripiego: number): number => {
  const valore = Number(entity.attributes[nome]);
  return Number.isFinite(valore) ? valore : ripiego;
};
/** E quelli di una TV o di una cassa. */
const MEDIA = {
  PAUSE: 1,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS: 16,
  NEXT: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  VOLUME_STEP: 1024,
  SELECT_SOURCE: 2048,
  STOP: 4096,
  PLAY: 16384,
} as const;

export const domainOf = (entityId: string): string => entityId.split('.')[0] ?? '';
const features = (entity: HaEntity): number => Number(entity.attributes.supported_features ?? 0);
const has = (entity: HaEntity, bit: number): boolean => (features(entity) & bit) === bit;

const percent = (label: string, code: string): Capability => ({ code, kind: 'range', label, min: 0, max: 100, step: 1, unit: '%' });

/**
 * Cosa misura un sensore, detto in italiano. Home Assistant lo sa — lo chiama
 * `device_class` — e «Temperatura» dice molto più di «Valore».
 */
export const MEASURES: Record<string, string> = {
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
  doorbell: 'Campanello',
  button: 'Pulsante',
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
    // Una telecamera non si accende e non si spegne da qui: si guarda. Il
    // fotogramma non sta fra le capacita' perche' non e' una cosa che il
    // dispositivo sa fare, e' quello che il dispositivo *e'*.
    case 'camera':
      return [{ code: 'frame', kind: 'image', label: 'Immagine' }];

    case 'switch':
    case 'input_boolean':
      return [acceso];

    case 'light': {
      const modi = (entity.attributes.supported_color_modes as string[] | undefined) ?? [];
      const out: Capability[] = [acceso];
      if (dimmable(entity)) out.push(percent('Luminosità', 'brightness'));
      // il bianco, da caldo a freddo, in kelvin: un cursore come un altro
      if (modi.includes('color_temp')) {
        out.push({
          code: 'color_temp',
          kind: 'range',
          label: 'Bianco',
          min: attr(entity, 'min_color_temp_kelvin', 2000),
          max: attr(entity, 'max_color_temp_kelvin', 6500),
          step: 100,
          unit: 'K',
        });
      }
      // il colore: una tinta sul cerchio, con il suo controllo
      if (modi.some((modo) => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(modo))) {
        out.push({ code: 'color', kind: 'color', label: 'Colore' });
      }
      return out;
    }

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
      return [
        move,
        ...(has(entity, COVER_SET_POSITION) ? [percent('Apertura', 'position')] : []),
        ...(has(entity, COVER_SET_TILT) ? [percent('Lamelle', 'tilt')] : []),
      ];
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
      const elenco = (entity.attributes.hvac_modes as string[] | undefined)?.filter((mode) => mode !== 'off');
      const modo: Capability | null = elenco && elenco.length > 1 ? modi('mode', 'Modo', elenco) : null;

      const ventole = entity.attributes.fan_modes as string[] | undefined;
      const profili = entity.attributes.preset_modes as string[] | undefined;
      return [
        acceso,
        ...(has(entity, CLIMATE_TARGET_TEMPERATURE) ? [temperatura] : []),
        ...(modo ? [modo] : []),
        ...(has(entity, CLIMATE_FAN_MODE) && ventole?.length
          ? [modi('fan_mode', 'Ventilatore', ventole)]
          : []),
        ...(has(entity, CLIMATE_PRESET_MODE) && profili?.length
          ? [modi('preset', 'Profilo', profili)]
          : []),
        // quanti gradi ci sono davvero, accanto a quanti se ne chiedono
        ...(entity.attributes.current_temperature !== undefined
          ? [{ code: 'current', kind: 'sensor', label: 'In stanza', unit: '°C' } as Capability]
          : []),
      ];
    }

    case 'media_player': {
      /*
       * Una TV o una cassa, con i controlli che abbiamo già: una levetta per
       * accenderla, un cursore per il volume, le sorgenti come scelte, e i
       * tasti del lettore come ordini. Ognuno solo se quella TV dice di
       * saperlo fare: un tasto che non fa niente è peggio di nessun tasto.
       */
      const out: Capability[] = [];
      if (has(entity, MEDIA.TURN_OFF) || has(entity, MEDIA.TURN_ON)) out.push(acceso);
      if (has(entity, MEDIA.VOLUME_SET)) out.push(percent('Volume', 'volume'));
      else if (has(entity, MEDIA.VOLUME_STEP)) {
        out.push({ code: 'volume_step', kind: 'enum', label: 'Volume', values: ['Abbassa', 'Alza'] });
      }
      if (has(entity, MEDIA.VOLUME_MUTE)) out.push({ code: 'mute', kind: 'switch', label: 'Muto' });
      const sorgenti = entity.attributes.source_list as string[] | undefined;
      if (has(entity, MEDIA.SELECT_SOURCE) && Array.isArray(sorgenti) && sorgenti.length) {
        out.push({ code: 'source', kind: 'enum', label: 'Sorgente', values: sorgenti });
      }
      const tasti = [
        ...(has(entity, MEDIA.PREVIOUS) ? ['Indietro'] : []),
        ...(has(entity, MEDIA.PLAY) ? ['Play'] : []),
        ...(has(entity, MEDIA.PAUSE) ? ['Pausa'] : []),
        ...(has(entity, MEDIA.STOP) ? ['Stop'] : []),
        ...(has(entity, MEDIA.NEXT) ? ['Avanti'] : []),
      ];
      if (tasti.length) out.push({ code: 'playback', kind: 'enum', label: 'Riproduzione', values: tasti });
      return out;
    }

    // Un pulsante e una scena della marca si premono e basta: un tasto solo.
    case 'button':
      return [{ code: 'press', kind: 'enum', label: 'Pulsante', values: ['Premi'] }];
    case 'scene':
      return [{ code: 'activate', kind: 'enum', label: 'Scena', values: ['Attiva'] }];

    // Un numero o un elenco che si comandano, e non come impostazione
    case 'number':
      return [
        {
          code: 'value',
          kind: 'range',
          label: 'Valore',
          min: attr(entity, 'min', 0),
          max: attr(entity, 'max', 100),
          step: attr(entity, 'step', 1),
          ...(entity.attributes.unit_of_measurement ? { unit: String(entity.attributes.unit_of_measurement) } : {}),
        },
      ];
    case 'select': {
      const voci = (entity.attributes.options as string[] | undefined) ?? [];
      return voci.length ? [{ code: 'value', kind: 'enum', label: 'Valore', values: voci }] : [];
    }

    // Una valvola dell'acqua: si apre e si chiude, e com'è lo dice davvero
    case 'valve': {
      const valvola: Capability = {
        code: 'valve',
        kind: 'enum',
        label: 'Valvola',
        values: has(entity, VALVE.STOP) ? ['Apri', 'Ferma', 'Chiudi'] : ['Apri', 'Chiudi'],
      };
      return has(entity, VALVE.SET_POSITION) ? [valvola, percent('Apertura', 'position')] : [valvola];
    }

    // Aspirapolvere e tosaerba: gli ordini, e come sta adesso
    case 'vacuum': {
      const ordini = [
        ...(has(entity, VACUUM.START) ? ['Avvia'] : []),
        ...(has(entity, VACUUM.PAUSE) ? ['Pausa'] : []),
        ...(has(entity, VACUUM.STOP) ? ['Fermati'] : []),
        ...(has(entity, VACUUM.RETURN_HOME) ? ['Torna alla base'] : []),
      ];
      return [
        ...(ordini.length ? [{ code: 'vacuum', kind: 'enum', label: 'Pulizia', values: ordini } as Capability] : []),
        { code: 'status', kind: 'sensor', label: 'Adesso', values: Object.keys(LAVORI), labels: LAVORI },
        ...(entity.attributes.battery_level !== undefined
          ? [{ code: 'battery', kind: 'sensor', label: 'Batteria', unit: '%' } as Capability]
          : []),
      ];
    }
    case 'lawn_mower': {
      const ordini = [
        ...(has(entity, MOWER.START) ? ['Avvia'] : []),
        ...(has(entity, MOWER.PAUSE) ? ['Pausa'] : []),
        ...(has(entity, MOWER.DOCK) ? ['Torna alla base'] : []),
      ];
      return [
        ...(ordini.length ? [{ code: 'mower', kind: 'enum', label: 'Taglio', values: ordini } as Capability] : []),
        { code: 'status', kind: 'sensor', label: 'Adesso', values: Object.keys(LAVORI), labels: LAVORI },
      ];
    }

    // Umidificatore e scaldabagno: acceso, quanto, e in che modo
    case 'humidifier': {
      const disponibili = entity.attributes.available_modes as string[] | undefined;
      return [
        acceso,
        {
          code: 'humidity',
          kind: 'range',
          label: 'Umidità',
          min: attr(entity, 'min_humidity', 30),
          max: attr(entity, 'max_humidity', 80),
          step: 1,
          unit: '%',
        },
        ...(has(entity, HUMIDIFIER_MODES) && disponibili?.length ? [modi('mode', 'Modo', disponibili)] : []),
        ...(entity.attributes.current_humidity !== undefined
          ? [{ code: 'current', kind: 'sensor', label: 'In stanza', unit: '%' } as Capability]
          : []),
      ];
    }
    case 'water_heater': {
      const disponibili = entity.attributes.operation_list as string[] | undefined;
      return [
        ...(has(entity, WATER_HEATER.ON_OFF) ? [acceso] : []),
        ...(has(entity, WATER_HEATER.TARGET_TEMPERATURE)
          ? [
              {
                code: 'temperature',
                kind: 'range',
                label: 'Temperatura',
                min: attr(entity, 'min_temp', 30),
                max: attr(entity, 'max_temp', 70),
                step: 1,
                unit: '°C',
              } as Capability,
            ]
          : []),
        ...(has(entity, WATER_HEATER.OPERATION_MODE) && disponibili?.length ? [modi('mode', 'Modo', disponibili)] : []),
        ...(entity.attributes.current_temperature !== undefined
          ? [{ code: 'current', kind: 'sensor', label: 'Adesso', unit: '°C' } as Capability]
          : []),
      ];
    }
    case 'siren':
      return [acceso];

    case 'event': {
      // un evento: il campanello, un tasto del telecomando. Le parole sono i suoi tipi
      const tipi = (entity.attributes.event_types as string[] | undefined) ?? [];
      if (!tipi.length) return [];
      const measure = entity.attributes.device_class as string | undefined;
      const labels = Object.fromEntries(tipi.flatMap((tipo) => (EVENTI[tipo] ? [[tipo, EVENTI[tipo] as string]] : [])));
      return [
        {
          code: 'value',
          kind: 'sensor',
          label: (measure && MEASURES[measure]) || 'Evento',
          values: tipi,
          ...(Object.keys(labels).length ? { labels } : {}),
          event: true,
        },
      ];
    }

    case 'binary_sensor': {
      // due parole e non un numero: «Aperta» o «Chiusa», e con quelle si chiede
      const measure = entity.attributes.device_class as string | undefined;
      if (!measure) return [];
      const [si, no] = WORDS[measure] ?? ['Sì', 'No'];
      return [{ code: 'value', kind: 'sensor', label: MEASURES[measure] ?? 'Valore', values: [si, no] }];
    }

    case 'sensor': {
      const unit = entity.attributes.unit_of_measurement as string | undefined;
      const measure = entity.attributes.device_class as string | undefined;
      // un sensore che dice una voce da un elenco — il programma di una
      // lavatrice, lo stato di una batteria — ha quelle voci come parole
      const voci = entity.attributes.options as string[] | undefined;
      if (measure === 'enum' && Array.isArray(voci) && voci.length) {
        return [{ code: 'value', kind: 'sensor', label: 'Stato', values: voci }];
      }
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

/** Per quanto un evento dice la sua parola prima di tornare muto. */
export const EVENTO_MS = 3_000;

/** I tipi di evento più comuni, detti in italiano. Sono nomi e non verbi: non si accordano con niente. */
const EVENTI: Record<string, string> = {
  pressed: 'una pressione',
  press: 'una pressione',
  single: 'una pressione',
  single_press: 'una pressione',
  initial_press: 'una pressione',
  short_release: 'una pressione',
  double: 'due pressioni',
  double_press: 'due pressioni',
  multi_press_2: 'due pressioni',
  triple: 'tre pressioni',
  triple_press: 'tre pressioni',
  long: 'una pressione lunga',
  long_press: 'una pressione lunga',
  hold: 'una pressione lunga',
  long_release: 'una pressione lunga',
  ring: 'uno squillo',
  motion: 'un movimento',
};

/** Un numero resta un numero; quello che non lo è resta la sua parola. */
export const numeric = (value: unknown): DeviceValue | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function stateOf(entity: HaEntity): Record<string, DeviceValue> {
  const domain = domainOf(entity.entity_id);
  const state: Record<string, DeviceValue> = {};

  /*
   * Un evento dice il suo tipo per pochi secondi, e poi niente. Lo stato di
   * un evento in Home Assistant è l'ora dell'ultima volta: così due squilli
   * di fila sono due passaggi, e ognuno fa partire la sua scena. Chi lo
   * rimette a zero è index.ts, che ricompone il dispositivo dopo quel poco.
   */
  if (domain === 'event') {
    const quando = Date.parse(entity.state);
    const recente = Number.isFinite(quando) && Date.now() - quando < EVENTO_MS;
    state.value = recente ? String(entity.attributes.event_type ?? '') : '';
    return state;
  }

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
  if (domain === 'media_player') {
    // spenta o in attesa è spenta; accesa è tutto il resto, anche «ferma»
    state.power = !['off', 'standby', 'unavailable', 'unknown'].includes(entity.state);
    const volume = numeric(entity.attributes.volume_level);
    if (volume !== undefined) state.volume = Math.round(Number(volume) * 100);
    if (typeof entity.attributes.is_volume_muted === 'boolean') state.mute = entity.attributes.is_volume_muted;
    if (typeof entity.attributes.source === 'string') state.source = entity.attributes.source;
    if (entity.state === 'playing') state.playback = 'Play';
    else if (entity.state === 'paused') state.playback = 'Pausa';
    return state;
  }

  if (domain === 'button' || domain === 'scene') return state;
  if (domain === 'number') {
    const valore = numeric(entity.state);
    if (valore !== undefined) state.value = valore;
    return state;
  }
  if (domain === 'select') {
    state.value = entity.state;
    return state;
  }
  if (domain === 'valve') {
    if (entity.state === 'open') state.valve = 'Apri';
    else if (entity.state === 'closed') state.valve = 'Chiudi';
    const posizione = numeric(entity.attributes.current_position);
    if (posizione !== undefined) state.position = posizione;
    return state;
  }
  if (domain === 'vacuum' || domain === 'lawn_mower') {
    state.status = String(entity.attributes.activity ?? entity.state);
    const batteria = numeric(entity.attributes.battery_level);
    if (batteria !== undefined) state.battery = batteria;
    return state;
  }
  if (domain === 'humidifier') {
    state.power = entity.state === 'on';
    const voluta = numeric(entity.attributes.humidity);
    if (voluta !== undefined) state.humidity = voluta;
    if (typeof entity.attributes.mode === 'string') state.mode = entity.attributes.mode;
    const adesso = numeric(entity.attributes.current_humidity);
    if (adesso !== undefined) state.current = adesso;
    return state;
  }
  if (domain === 'water_heater') {
    state.power = entity.state !== 'off';
    const voluta = numeric(entity.attributes.temperature);
    if (voluta !== undefined) state.temperature = voluta;
    if (typeof entity.attributes.operation_mode === 'string') state.mode = entity.attributes.operation_mode;
    const adesso = numeric(entity.attributes.current_temperature);
    if (adesso !== undefined) state.current = adesso;
    return state;
  }

  if (domain === 'cover') {
    if (entity.state === 'open') state.move = 'Apri';
    else if (entity.state === 'closed') state.move = 'Chiudi';
    const lamelle = numeric(entity.attributes.current_tilt_position);
    if (lamelle !== undefined) state.tilt = lamelle;
  } else if (domain === 'lock') {
    state.lock = entity.state === 'locked' ? 'Chiudi a chiave' : 'Apri';
  } else if (domain === 'climate') {
    // un condizionatore acceso può essere in deumidificazione o ventilazione:
    // «diverso da spento» è l'unica regola che non lascia fuori nessuno
    state.power = entity.state !== 'off' && entity.state !== 'unavailable';
    state.mode = entity.state;
    const stanza = numeric(entity.attributes.current_temperature);
    if (stanza !== undefined) state.current = stanza;
    if (typeof entity.attributes.fan_mode === 'string') state.fan_mode = entity.attributes.fan_mode;
    if (typeof entity.attributes.preset_mode === 'string') state.preset = entity.attributes.preset_mode;
  } else {
    state.power = entity.state === 'on';
  }

  // il bianco in kelvin, e il colore come tinta sul cerchio
  const kelvin = numeric(entity.attributes.color_temp_kelvin);
  if (kelvin !== undefined) state.color_temp = kelvin;
  const hs = entity.attributes.hs_color as [number, number] | undefined;
  if (Array.isArray(hs) && Number.isFinite(Number(hs[0]))) state.color = Math.round(Number(hs[0]));

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

  // una capacità di un'altra entità dello stesso dispositivo: il comando va a
  // lei, e si traduce per quello che è lei (connector/src/gruppi.ts)
  const [altra, interno] = code.split('#');
  if (interno !== undefined && altra) return toAccessoryCall(altra, value);

  switch (code) {
    case 'power':
      return { domain: 'homeassistant', service: value ? 'turn_on' : 'turn_off', data: {} };

    case 'brightness':
      return { domain: 'light', service: 'turn_on', data: { brightness_pct: Number(value) } };

    case 'speed':
      return { domain: 'fan', service: 'set_percentage', data: { percentage: Number(value) } };

    case 'position':
      return domain === 'valve'
        ? { domain: 'valve', service: 'set_valve_position', data: { position: Number(value) } }
        : { domain: 'cover', service: 'set_cover_position', data: { position: Number(value) } };

    case 'temperature':
      return domain === 'water_heater'
        ? { domain: 'water_heater', service: 'set_temperature', data: { temperature: Number(value) } }
        : { domain: 'climate', service: 'set_temperature', data: { temperature: Number(value) } };

    case 'color_temp':
      return { domain: 'light', service: 'turn_on', data: { color_temp_kelvin: Number(value) } };
    case 'color':
      return { domain: 'light', service: 'turn_on', data: { hs_color: [Number(value), 100] } };
    case 'tilt':
      return { domain: 'cover', service: 'set_cover_tilt_position', data: { tilt_position: Number(value) } };
    case 'fan_mode':
      return { domain: 'climate', service: 'set_fan_mode', data: { fan_mode: String(value) } };
    case 'preset':
      return { domain: 'climate', service: 'set_preset_mode', data: { preset_mode: String(value) } };
    case 'humidity':
      return { domain: 'humidifier', service: 'set_humidity', data: { humidity: Number(value) } };
    case 'press':
      return { domain: 'button', service: 'press', data: {} };
    case 'activate':
      return { domain: 'scene', service: 'turn_on', data: {} };
    case 'value':
      if (domain === 'number') return { domain: 'number', service: 'set_value', data: { value: Number(value) } };
      if (domain === 'select') return { domain: 'select', service: 'select_option', data: { option: String(value) } };
      return null;
    case 'valve': {
      const service = value === 'Apri' ? 'open_valve' : value === 'Chiudi' ? 'close_valve' : 'stop_valve';
      return { domain: 'valve', service, data: {} };
    }
    case 'vacuum': {
      const servizi: Record<string, string> = { Avvia: 'start', Pausa: 'pause', Fermati: 'stop', 'Torna alla base': 'return_to_base' };
      const service = servizi[String(value)];
      return service ? { domain: 'vacuum', service, data: {} } : null;
    }
    case 'mower': {
      const servizi: Record<string, string> = { Avvia: 'start_mowing', Pausa: 'pause', 'Torna alla base': 'dock' };
      const service = servizi[String(value)];
      return service ? { domain: 'lawn_mower', service, data: {} } : null;
    }

    case 'lock':
      return domain === 'lock'
        ? { domain: 'lock', service: value === 'Apri' ? 'unlock' : 'lock', data: {} }
        : null;

    case 'mode':
      if (domain === 'climate') return { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: String(value) } };
      if (domain === 'humidifier') return { domain: 'humidifier', service: 'set_mode', data: { mode: String(value) } };
      if (domain === 'water_heater') {
        return { domain: 'water_heater', service: 'set_operation_mode', data: { operation_mode: String(value) } };
      }
      return null;

    case 'volume':
      return domain === 'media_player'
        ? { domain: 'media_player', service: 'volume_set', data: { volume_level: Number(value) / 100 } }
        : null;

    case 'volume_step':
      return domain === 'media_player'
        ? { domain: 'media_player', service: value === 'Alza' ? 'volume_up' : 'volume_down', data: {} }
        : null;

    case 'mute':
      return domain === 'media_player'
        ? { domain: 'media_player', service: 'volume_mute', data: { is_volume_muted: Boolean(value) } }
        : null;

    case 'source':
      return domain === 'media_player'
        ? { domain: 'media_player', service: 'select_source', data: { source: String(value) } }
        : null;

    case 'playback': {
      const servizi: Record<string, string> = {
        Play: 'media_play',
        Pausa: 'media_pause',
        Stop: 'media_stop',
        Avanti: 'media_next_track',
        Indietro: 'media_previous_track',
      };
      const service = servizi[String(value)];
      return domain === 'media_player' && service ? { domain: 'media_player', service, data: {} } : null;
    }

    case 'move': {
      const service = value === 'Apri' ? 'open_cover' : value === 'Chiudi' ? 'close_cover' : 'stop_cover';
      return domain === 'cover' ? { domain: 'cover', service, data: {} } : null;
    }

    default:
      return null;
  }
}

/** A quale entità va un comando con `#`: quella prima del cancelletto. */
export const targetOf = (externalId: string, code: string): string => (code.includes('#') ? (code.split('#')[0] as string) : externalId);

/**
 * Un comando a un'impostazione, secondo cosa è: una levetta si accende, un
 * numero si scrive, un elenco si sceglie. Un sensore non si comanda.
 */
function toAccessoryCall(entityId: string, value: DeviceValue): ServiceCall | null {
  switch (domainOf(entityId)) {
    case 'switch':
    case 'input_boolean':
      return { domain: 'homeassistant', service: value ? 'turn_on' : 'turn_off', data: {} };
    case 'number':
      return { domain: 'number', service: 'set_value', data: { value: Number(value) } };
    case 'button':
      return { domain: 'button', service: 'press', data: {} };
    case 'select':
      return { domain: 'select', service: 'select_option', data: { option: String(value) } };
    default:
      return null;
  }
}
