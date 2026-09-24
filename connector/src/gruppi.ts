import type { Capability, DeviceSnapshot, DeviceValue } from '../../shared/protocol.js';
import { capabilitiesOf, domainOf, MEASURES, numeric, stateOf, translate } from './entities.js';
import type { HaEntity, Voce } from './homeassistant.js';

/**
 * Un dispositivo vero, con dentro le sue entità.
 *
 * Home Assistant descrive una presa Shelly con i consumi come due entità —
 * l'interruttore e il sensore della potenza — e una presa eWeLink con le sue
 * impostazioni come cinque. Prese una per una diventavano schede diverse, e
 * con cento marche le schede si moltiplicavano. Qui si rimettono insieme: una
 * entità principale, quella che si comanda, e attorno le letture e le
 * impostazioni dello stesso dispositivo.
 *
 * Le capacità che vengono da un'altra entità hanno il codice
 * `<entità>#<codice>`: l'agente sa a chi mandare il comando, e per il resto
 * del mondo è un nome come un altro. È così che una funzione nuova di una
 * marca che non conosciamo arriva fino allo schermo senza scrivere niente
 * per lei, come fa Alexa con i suoi comandi generici.
 */

/** Le entità che si comandano: una di queste è il dispositivo. */
const PRINCIPALI = new Set(['light', 'switch', 'input_boolean', 'fan', 'cover', 'climate', 'lock', 'camera']);
/** Le letture, che stanno con il dispositivo di cui misurano qualcosa. */
const LETTURE = new Set(['sensor', 'binary_sensor', 'event']);
/** Le impostazioni che sappiamo disegnare: una levetta, un numero, un elenco. */
const IMPOSTAZIONI = new Set(['switch', 'number', 'select']);

/** Quale misura dà il nome a un dispositivo fatto solo di letture. */
const PRIMA = ['temperature', 'humidity', 'power', 'motion', 'door', 'window', 'moisture', 'smoke'];

export interface Gruppo {
  /** L'entità principale: il suo id resta l'id del dispositivo. */
  primaria: string;
  /** Le altre entità dello stesso dispositivo che ci stanno dentro. */
  accessori: string[];
  /** Come si chiama il dispositivo vero. */
  nome: string;
}

const impostazione = (voce: Voce): boolean => voce.category === 'config' && IMPOSTAZIONI.has(domainOf(voce.entityId));
const lettura = (voce: Voce): boolean => !voce.category && LETTURE.has(domainOf(voce.entityId));
const principale = (voce: Voce): boolean => !voce.category && PRINCIPALI.has(domainOf(voce.entityId));

/**
 * Chi sta con chi.
 *
 * Un dispositivo con una sola cosa da comandare diventa una scheda sola,
 * con dentro letture e impostazioni. Uno che ne ha più d'una — un relè a
 * quattro canali — resta diviso, un canale per scheda, come prima: di quale
 * canale sia la lettura dei consumi non si può sapere, e le impostazioni
 * restano fuori. Uno fatto solo di letture — una sonda di temperatura e
 * umidità — diventa una scheda con tutte e due.
 */
export function raggruppa(voci: Voce[], stati: Map<string, HaEntity>): Gruppo[] {
  const perDispositivo = new Map<string, Voce[]>();
  for (const voce of voci) {
    if (!stati.has(voce.entityId)) continue;
    perDispositivo.set(voce.deviceId, [...(perDispositivo.get(voce.deviceId) ?? []), voce]);
  }

  const gruppi: Gruppo[] = [];
  for (const suoi of perDispositivo.values()) {
    const ordinati = [...suoi].sort((a, b) => a.entityId.localeCompare(b.entityId));
    const nome = ordinati[0]?.deviceName ?? '';
    const vale = (voce: Voce): boolean => !!translate(stati.get(voce.entityId) as HaEntity);

    const principali = ordinati.filter((voce) => principale(voce) && vale(voce));
    const letture = ordinati.filter((voce) => lettura(voce) && vale(voce));
    const impostazioni = ordinati.filter(impostazione);

    if (principali.length === 1) {
      const [sola] = principali as [Voce];
      gruppi.push({
        primaria: sola.entityId,
        accessori: [...letture, ...impostazioni].map((voce) => voce.entityId),
        nome,
      });
    } else if (principali.length > 1) {
      for (const voce of [...principali, ...letture]) gruppi.push({ primaria: voce.entityId, accessori: [], nome });
    } else if (letture.length) {
      // la scheda prende il nome della misura che conta di più, non della prima in ordine alfabetico
      const peso = (voce: Voce): number => {
        const misura = String(stati.get(voce.entityId)?.attributes.device_class ?? '');
        const at = PRIMA.indexOf(misura);
        return at < 0 ? PRIMA.length : at;
      };
      const [prima, ...altre] = [...letture].sort((a, b) => peso(a) - peso(b)) as [Voce, ...Voce[]];
      gruppi.push({
        primaria: prima.entityId,
        accessori: [...altre, ...impostazioni].map((voce) => voce.entityId),
        nome,
      });
    }
  }
  return gruppi;
}

/**
 * I nomi delle impostazioni più comuni, detti in italiano. Le integrazioni
 * esterne spesso non hanno la traduzione, e «INCHING Duration» a schermo in
 * mezzo a tutto il resto in italiano è la cosa che si nota di più.
 */
const DIZIONARIO: Record<string, string> = {
  inching: 'Impulso',
  pulse: 'Impulso',
  'inching duration': 'Durata dell’impulso',
  pulsewidth: 'Durata dell’impulso',
  pulse_width: 'Durata dell’impulso',
  led: 'Luce spia',
  indicator: 'Luce spia',
  light_mode: 'Luce spia',
  backlight: 'Retroilluminazione',
  child_lock: 'Blocco bambini',
  'child lock': 'Blocco bambini',
  relay_status: 'Dopo un blackout',
  power_on_behavior: 'Dopo un blackout',
  'power on behavior': 'Dopo un blackout',
  startup: 'Dopo un blackout',
  countdown: 'Timer',
};

/** Le voci da macchina più comuni, per gli elenchi. */
const VOCI: Record<string, string> = {
  on: 'Acceso',
  off: 'Spento',
  power_on: 'Acceso',
  power_off: 'Spento',
  last: 'Com’era',
  previous: 'Com’era',
  memory: 'Com’era',
  stay: 'Com’era',
  toggle: 'Al contrario',
  none: 'Nessuna',
  relay: 'Come il relè',
  pos: 'Come il relè',
};

const pulito = (testo: string): string => testo.trim().toLowerCase();

/**
 * Come si chiama una capacità che viene da un'altra entità.
 *
 * Prima la parola che sappiamo noi per le misure — «Temperatura» dice più di
 * qualunque traduzione — poi la traduzione dell'integrazione, poi il nostro
 * dizionario, e per ultimo il nome che l'entità ha nella centrale, senza il
 * nome del dispositivo davanti.
 */
export function etichetta(voce: Voce, entity: HaEntity, traduzioni: Record<string, string>): string {
  const domain = domainOf(voce.entityId);
  const misura = entity.attributes.device_class as string | undefined;
  if (LETTURE.has(domain) && misura && MEASURES[misura]) return MEASURES[misura] as string;

  const tradotta = voce.translationKey
    ? traduzioni[`component.${voce.platform}.entity.${domain}.${voce.translationKey}.name`]
    : undefined;
  if (tradotta) return tradotta;

  const intero = voce.originalName ?? String(entity.attributes.friendly_name ?? '');
  const senza = voce.deviceName && intero.startsWith(voce.deviceName) ? intero.slice(voce.deviceName.length) : intero;
  const nostra = DIZIONARIO[pulito(voce.translationKey ?? '')] ?? DIZIONARIO[pulito(senza)];
  if (nostra) return nostra;

  const resto = senza.trim();
  if (resto) return resto.charAt(0).toLocaleUpperCase('it') + resto.slice(1);

  /*
   * Senza un nome, a volte il nome lo dicono le voci. Un elenco che sa solo
   * «acceso», «spento» e «com'era» è lo stato dopo un blackout — il
   * selettore che eWeLink mette su ogni canale senza chiamarlo.
   */
  const voci = (entity.attributes.options as string[] | undefined)?.map(pulito);
  if (voci?.length && voci.every((one) => BLACKOUT.has(one))) return 'Dopo un blackout';
  return 'Valore';
}

/** Le voci di un selettore dello stato dopo un blackout, come le chiamano le marche. */
const BLACKOUT = new Set(['on', 'off', 'stay', 'last', 'previous', 'memory', 'power_on', 'power_off', 'toggle']);

/** Le voci di un elenco dette in italiano, dalla traduzione o dal dizionario. */
function vociDi(voce: Voce, valori: string[], traduzioni: Record<string, string>): Record<string, string> | undefined {
  const dette: Record<string, string> = {};
  const domain = domainOf(voce.entityId);
  for (const valore of valori) {
    const tradotta = voce.translationKey
      ? traduzioni[`component.${voce.platform}.entity.${domain}.${voce.translationKey}.state.${valore}`]
      : undefined;
    const detta = tradotta ?? VOCI[pulito(valore)];
    if (detta) dette[valore] = detta;
  }
  return Object.keys(dette).length ? dette : undefined;
}

/** Le capacità di un'entità che sta dentro un altro dispositivo, con il codice che dice di chi sono. */
function capacitaAccessorio(voce: Voce, entity: HaEntity, traduzioni: Record<string, string>): Capability[] {
  const code = (interno: string): string => `${voce.entityId}#${interno}`;
  const label = etichetta(voce, entity, traduzioni);

  if (voce.category === 'config') {
    switch (domainOf(voce.entityId)) {
      case 'switch':
        return [{ code: code('power'), kind: 'switch', label, setting: true }];
      case 'number': {
        const min = Number(entity.attributes.min ?? 0);
        const max = Number(entity.attributes.max ?? 100);
        const step = Number(entity.attributes.step ?? 1);
        const unit = entity.attributes.unit_of_measurement as string | undefined;
        return [{ code: code('value'), kind: 'range', label, min, max, step, ...(unit ? { unit } : {}), setting: true }];
      }
      case 'select': {
        const values = (entity.attributes.options as string[] | undefined) ?? [];
        if (!values.length) return [];
        const labels = vociDi(voce, values, traduzioni);
        return [{ code: code('value'), kind: 'enum', label, values, ...(labels ? { labels } : {}), setting: true }];
      }
      default:
        return [];
    }
  }

  // una lettura: la stessa del sensore da solo, con il codice suo e il nome giusto
  return capabilitiesOf(entity).map((capability) => ({ ...capability, code: code(capability.code), label }));
}

/** Lo stato di un'entità che sta dentro un altro dispositivo, con i codici suoi. */
function statoAccessorio(voce: Voce, entity: HaEntity): Record<string, DeviceValue> {
  const code = (interno: string): string => `${voce.entityId}#${interno}`;
  if (voce.category === 'config') {
    const domain = domainOf(voce.entityId);
    if (entity.state === 'unavailable' || entity.state === 'unknown') return {};
    if (domain === 'switch') return { [code('power')]: entity.state === 'on' };
    if (domain === 'number') {
      const valore = numeric(entity.state);
      return valore === undefined ? {} : { [code('value')]: valore };
    }
    if (domain === 'select') return { [code('value')]: entity.state };
    return {};
  }
  return Object.fromEntries(Object.entries(stateOf(entity)).map(([chiave, valore]) => [code(chiave), valore]));
}

/**
 * Il dispositivo di un gruppo, com'è adesso: quello che dice l'entità
 * principale, con dentro le capacità e i valori delle altre.
 */
export function componi(
  gruppo: Gruppo,
  stati: Map<string, HaEntity>,
  voci: Map<string, Voce>,
  traduzioni: Record<string, string>,
): DeviceSnapshot | null {
  const base = translate(stati.get(gruppo.primaria) as HaEntity);
  if (!base) return null;

  const capabilities = [...base.capabilities];
  const state = { ...base.state };
  const dentro: string[] = [];

  for (const id of gruppo.accessori) {
    const entity = stati.get(id);
    const voce = voci.get(id);
    if (!entity || !voce) continue;
    const sue = capacitaAccessorio(voce, entity, traduzioni);
    if (!sue.length) continue;
    capabilities.push(...sue);
    Object.assign(state, statoAccessorio(voce, entity));
    // una lettura poteva essere un dispositivo a sé: il backend ci sposta sopra quello che la nominava
    if (!voce.category) dentro.push(id);
  }

  /*
   * Le voci di un sensore a elenco — il programma, lo stato della batteria —
   * dette in italiano, se la centrale o il dizionario le sanno. Vale anche
   * per quello principale, che dal traduttore arriva senza.
   */
  const conVoci = capabilities.map((capability) => {
    if (capability.kind !== 'sensor' || !capability.values?.length || capability.labels || capability.event) return capability;
    const id = capability.code.includes('#') ? (capability.code.split('#')[0] as string) : gruppo.primaria;
    const voce = voci.get(id);
    const labels = voce ? vociDi(voce, capability.values, traduzioni) : undefined;
    return labels ? { ...capability, labels } : capability;
  });

  return { ...base, capabilities: conVoci, state, ...(dentro.length ? { absorbs: dentro } : {}) };
}
