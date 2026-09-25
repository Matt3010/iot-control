import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { HaEntity } from '../homeassistant.js';
import { accesoSe, adesso, classe, elenco, fra, ignota, metti, nomeMisura, numeric, vociDi } from './comune.js';
import { EVENTI, gradi } from './lingua.js';
import type { Dominio } from './tipo.js';

/**
 * Le cose che si guardano e basta: un sensore, un sensore a due stati, un
 * evento, il tempo che fa, dove sta qualcuno. Non hanno comandi.
 */

/** Per quanto un evento dice la sua parola prima di tornare muto. */
export const EVENTO_MS = 3_000;

/**
 * Un sensore a due stati dice `on`/`off`, che è la lingua delle macchine.
 * Le parole giuste dipendono da cosa guarda: una porta è aperta o chiusa,
 * un rilevatore vede qualcosa o non vede niente.
 *
 * Queste parole sono il valore, non solo come si legge: le condizioni già
 * scritte le ricordano così («quando la porta diventa Aperta»), e per questo
 * restano nostre anche dove la centrale ne avrebbe di sue.
 */
const WORDS: Record<string, { si: string; no: string }> = {
  motion: { si: 'Rilevato', no: 'Niente' },
  occupancy: { si: 'Qualcuno', no: 'Nessuno' },
  presence: { si: 'In casa', no: 'Fuori' },
  door: { si: 'Aperta', no: 'Chiusa' },
  window: { si: 'Aperta', no: 'Chiusa' },
  opening: { si: 'Aperto', no: 'Chiuso' },
  garage_door: { si: 'Aperto', no: 'Chiuso' },
  lock: { si: 'Aperta', no: 'Chiusa' },
  moisture: { si: 'Bagnato', no: 'Asciutto' },
  smoke: { si: 'Fumo', no: 'Pulito' },
  gas: { si: 'Gas', no: 'Pulito' },
  carbon_monoxide: { si: 'Rilevato', no: 'Pulito' },
  problem: { si: 'Problema', no: 'A posto' },
  safety: { si: 'Pericolo', no: 'A posto' },
  tamper: { si: 'Manomesso', no: 'Integro' },
  battery: { si: 'Scarica', no: 'Carica' },
  battery_charging: { si: 'In carica', no: 'Non in carica' },
  connectivity: { si: 'Collegato', no: 'Scollegato' },
  plug: { si: 'Inserita', no: 'Staccata' },
  power: { si: 'Alimentato', no: 'Senza corrente' },
  running: { si: 'In funzione', no: 'Fermo' },
  moving: { si: 'In movimento', no: 'Fermo' },
  vibration: { si: 'Vibra', no: 'Fermo' },
  sound: { si: 'Rumore', no: 'Silenzio' },
  heat: { si: 'Troppo caldo', no: 'Normale' },
  cold: { si: 'Troppo freddo', no: 'Normale' },
  light: { si: 'Luce', no: 'Buio' },
  update: { si: 'Da aggiornare', no: 'Aggiornato' },
};

/** Le due parole di un sensore a due stati; senza tipo, le più neutre che ci siano. */
const paroleDi = (entity: HaEntity): [string, string] => {
  const parole = WORDS[classe(entity)];
  return parole ? [parole.si, parole.no] : ['Sì', 'No'];
};

/**
 * Le voci di un sensore che dice una voce da un elenco — il programma di una
 * lavatrice, lo stato di una batteria — anche quando non dice di essere un
 * elenco. Con un'unità è un numero, e le voci non contano.
 */
const vociSensore = (entity: HaEntity): string[] | undefined =>
  entity.attributes.unit_of_measurement ? undefined : elenco(entity, 'options');

/** Dove sta qualcuno, detto con due parole sole: le condizioni si scrivono con quelle. */
const PRESENZA: [string, string] = ['A casa', 'Fuori'];
const presenza: Capability = { code: 'value', kind: 'sensor', label: 'Presenza', values: PRESENZA };
const statoPresenza: Dominio['stato'] = ({ entity }) => {
  const state: Record<string, DeviceValue> = {};
  if (!ignota(entity.state)) state.value = entity.state === 'home' ? PRESENZA[0] : PRESENZA[1];
  return state;
};

const TEMPO = [
  'clear-night',
  'cloudy',
  'exceptional',
  'fog',
  'hail',
  'lightning',
  'lightning-rainy',
  'partlycloudy',
  'pouring',
  'rainy',
  'snowy',
  'snowy-rainy',
  'sunny',
  'windy',
  'windy-variant',
];

export const sensore: Dominio = {
  ruolo: 'lettura',
  nomeLettura: 'Valore',
  capacita(ctx) {
    const { entity, prima } = ctx;
    const unit = entity.attributes.unit_of_measurement as string | undefined;
    const voci = vociSensore(entity);
    if (voci) return [adesso(ctx, voci, 'value', 'Stato')];
    if (unit || classe(entity)) return [{ code: 'value', kind: 'sensor', label: nomeMisura(entity, sensore.nomeLettura), ...(unit ? { unit } : {}) }];
    // un numero che si misura nel tempo ma senza unità è un dettaglio interno dell'integrazione
    if (entity.attributes.state_class) return [];
    /*
     * Senza unità, senza tipo e senza elenco, una parola si legge — l'ultima
     * azione di un telecomando, la fase di un programma — ma un numero no:
     * «Mansarda Action» che vale 0 è rumore. Qui la forma non dice niente,
     * e lo dice solo il primo valore conosciuto. Poi resta quella: se no
     * la forma cambierebbe con il valore.
     */
    if (prima) return prima;
    if (ignota(entity.state)) return [];
    return numeric(entity.state) === undefined ? [{ code: 'value', kind: 'sensor', label: 'Stato' }] : [];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    if (ignota(entity.state)) return state;
    const voci = vociSensore(entity);
    metti(state, 'value', voci ? fra(entity.state, voci) : (numeric(entity.state) ?? entity.state));
    return state;
  },
  comandi: {},
};

/** Due parole e non un numero: «Aperta» o «Chiusa», e con quelle si chiede. */
export const binario: Dominio = {
  ruolo: 'lettura',
  nomeLettura: 'Stato',
  capacita({ entity }) {
    return [{ code: 'value', kind: 'sensor', label: nomeMisura(entity, binario.nomeLettura), values: paroleDi(entity) }];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    const [si, no] = paroleDi(entity);
    const acceso = accesoSe(entity.state);
    metti(state, 'value', acceso === undefined ? undefined : acceso ? si : no);
    return state;
  },
  comandi: {},
};

/** Un evento: il campanello, un tasto del telecomando. Le parole sono i suoi tipi. */
export const evento: Dominio = {
  ruolo: 'lettura',
  evento: true,
  nomeLettura: 'Evento',
  capacita(ctx) {
    const tipi = elenco(ctx.entity, 'event_types');
    if (!tipi) return [];
    const labels = vociDi(ctx.entity, ctx.origine, tipi, 'event_type', EVENTI);
    return [{ code: 'value', kind: 'sensor', label: nomeMisura(ctx.entity, evento.nomeLettura), values: tipi, ...(labels ? { labels } : {}), event: true }];
  },
  /*
   * Un evento dice il suo tipo per pochi secondi, e poi niente. Lo stato di
   * un evento nella centrale è l'ora dell'ultima volta, ma quell'ora è
   * dell'orologio della centrale, e confrontarla con il nostro vuol dire
   * sbagliare di quanto i due orologi non vanno d'accordo. Conta quando lo
   * stato è arrivato qui: uno letto a un giro d'inventario non è arrivato
   * adesso, e tace. Chi lo rimette a zero è index.ts, che ricompone il
   * dispositivo dopo quel poco; e se ne arriva un altro mentre il primo parla
   * ancora, index.ts fa tornare muto il primo prima di dire il secondo, così
   * anche due squilli uguali sono due passaggi.
   */
  /*
   * Un evento ha sempre il suo codice, vuoto quando tace, anche quando la
   * centrale non ha ancora sentito niente (`unknown`: il campanello mai
   * suonato da quando si è accesa). Per il server un passaggio c'è solo fra
   * due valori; senza il vuoto di prima, la prima pressione in assoluto
   * sarebbe solo com'è adesso, e non farebbe partire niente. Un evento muto
   * non è un valore inventato: vuol dire proprio che adesso non succede
   * niente. Irraggiungibile invece non si sa, e il codice resta fuori: al
   * ritorno il primo stato è comunque com'è adesso, e il muto di allora fa
   * da prima per la pressione dopo.
   */
  stato({ entity, arrivo }): Record<string, DeviceValue> {
    if (entity.state === 'unavailable') return {};
    const recente = !ignota(entity.state) && arrivo !== undefined && Date.now() - arrivo < EVENTO_MS;
    return { value: recente ? String(entity.attributes.event_type ?? '') : '' };
  },
  comandi: {},
};

export const meteo: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { entity } = ctx;
    const unita = entity.attributes.temperature_unit as string | undefined;
    return [
      adesso(ctx, TEMPO, 'value', 'Tempo'),
      ...(entity.attributes.temperature !== undefined
        ? [{ code: 'current', kind: 'sensor', label: 'Temperatura', unit: unita ?? gradi } as Capability]
        : []),
      ...(entity.attributes.humidity !== undefined ? [{ code: 'current_humidity', kind: 'sensor', label: 'Umidità', unit: '%' } as Capability] : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'value', fra(entity.state, TEMPO));
    metti(state, 'current', numeric(entity.attributes.temperature));
    metti(state, 'current_humidity', numeric(entity.attributes.humidity));
    return state;
  },
  comandi: {},
};

/*
 * Dove sta qualcuno. Una persona senza niente che la segua non ha una
 * presenza da dire. Un tracker del router dice se un apparecchio è in rete,
 * non dove sta: su una mappa di case sarebbe un segno per ogni cosa
 * collegata al wifi. Un tracker che non dice da dove sa quello che sa —
 * succede quando la centrale non lo sente — non si sa cos'è, e finché non lo
 * dice resta fuori.
 */
export const persona: Dominio = {
  ruolo: 'principale',
  capacita: ({ entity }) => (elenco(entity, 'device_trackers') ? [presenza] : []),
  stato: statoPresenza,
  comandi: {},
};

export const tracker: Dominio = {
  ruolo: 'principale',
  capacita({ entity }) {
    const fonte = entity.attributes.source_type;
    return fonte === undefined || fonte === null || fonte === 'router' ? [] : [presenza];
  },
  stato: statoPresenza,
  comandi: {},
};
