import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { adesso, fra, has, metti, nomeDellaClasse, numeric, ordina, ordini, percent, servizio, tasti, type Ordine } from './comune.js';
import type { HaEntity } from '../homeassistant.js';
import type { Dominio } from './tipo.js';

/**
 * Quello che si apre e si chiude: una tapparella, una tenda, un cancello, una
 * valvola dell'acqua. Stanno insieme perché si comandano allo stesso modo —
 * apri, ferma, chiudi, e a volte quanto — e perché la regola su quali tasti
 * offrire è una sola: quelli che la cosa dice di avere.
 */

const COVER = { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8, OPEN_TILT: 16, CLOSE_TILT: 32, STOP_TILT: 64, SET_TILT: 128 } as const;
const VALVE = { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8 } as const;

/** Gli stati che la centrale conosce per una tenda; come si leggono lo dice lei (`vociDi`). */
const STATI_TENDA = ['open', 'opening', 'closed', 'closing'];

const MOVIMENTO: Ordine[] = [
  { voce: 'Apri', servizio: 'open_cover', bit: COVER.OPEN, stato: 'open' },
  { voce: 'Ferma', servizio: 'stop_cover', bit: COVER.STOP },
  { voce: 'Chiudi', servizio: 'close_cover', bit: COVER.CLOSE, stato: 'closed' },
];
const LAMELLE: Ordine[] = [
  { voce: 'Apri', servizio: 'open_cover_tilt', bit: COVER.OPEN_TILT },
  { voce: 'Ferma', servizio: 'stop_cover_tilt', bit: COVER.STOP_TILT },
  { voce: 'Chiudi', servizio: 'close_cover_tilt', bit: COVER.CLOSE_TILT },
];
const VALVOLA: Ordine[] = [
  { voce: 'Apri', servizio: 'open_valve', bit: VALVE.OPEN, stato: 'open', detto: { se: 'aperto', quando: 'si apre' } },
  { voce: 'Ferma', servizio: 'stop_valve', bit: VALVE.STOP },
  { voce: 'Chiudi', servizio: 'close_valve', bit: VALVE.CLOSE, stato: 'closed', detto: { se: 'chiuso', quando: 'si chiude' } },
];

/** Una cosa che non dice niente di quello che sa fare si apre e si chiude, come prima. */
const senzaFerma = (ordine: Ordine): boolean => ordine.voce !== 'Ferma';

/** Se la cosa dice almeno uno dei bit dati: se no non dice niente di sé. */
const diceQualcosa = (entity: HaEntity, bits: number[]): boolean => bits.some((bit) => has(entity, bit));

/** Apri, ferma e chiudi di una tenda, con il ripiego per quella che non dice niente. */
const movimento = (entity: HaEntity) =>
  ordini(
    entity,
    MOVIMENTO,
    diceQualcosa(entity, [COVER.OPEN, COVER.STOP, COVER.CLOSE, COVER.SET_POSITION, COVER.OPEN_TILT, COVER.STOP_TILT, COVER.CLOSE_TILT])
      ? undefined
      : senzaFerma,
  );

/** Lo stesso per una valvola. */
const valvola = (entity: HaEntity) =>
  ordini(entity, VALVOLA, diceQualcosa(entity, [VALVE.OPEN, VALVE.STOP, VALVE.CLOSE, VALVE.SET_POSITION]) ? undefined : senzaFerma);

export const tenda: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    const { entity } = ctx;
    const lamelle = ordini(entity, LAMELLE).voci;
    return [
      // in italiano, e con le parole che si usano per quel tipo di tenda
      ...tasti('move', nomeDellaClasse(entity) ?? 'Movimento', movimento(entity).voci),
      ...(has(entity, COVER.SET_POSITION) ? [percent('Apertura', 'position')] : []),
      ...(has(entity, COVER.SET_TILT) ? [percent('Lamelle', 'tilt')] : tasti('tilt_move', 'Lamelle', lamelle)),
      // il movimento è l'ultimo ordine; com'è davvero, anche a metà corsa, si legge qui
      adesso(ctx, STATI_TENDA),
    ];
  },
  /*
   * Una tapparella aperta non è «accesa»: non consuma e non si è dimenticata
   * niente. Se contasse, il pin sulla mappa si scalderebbe per una tenda
   * tirata su, che non è quello che vuoi sapere da lontano.
   */
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'move', movimento(entity).voceDi(entity.state));
    metti(state, 'status', fra(entity.state, STATI_TENDA));
    metti(state, 'position', numeric(entity.attributes.current_position));
    metti(state, 'tilt', numeric(entity.attributes.current_tilt_position));
    return state;
  },
  comandi: {
    move: ordina('cover', MOVIMENTO),
    tilt_move: ordina('cover', LAMELLE),
    position: servizio('cover', 'set_cover_position', (valore) => ({ position: Number(valore) })),
    tilt: servizio('cover', 'set_cover_tilt_position', (valore) => ({ tilt_position: Number(valore) })),
  },
};

/** Una valvola dell'acqua: si apre e si chiude, e com'è lo dice davvero. */
export const valvolaAcqua: Dominio = {
  ruolo: 'principale',
  capacita({ entity }) {
    const { voci, detti } = valvola(entity);
    return [
      ...(voci.length ? [{ code: 'valve', kind: 'enum', label: 'Valvola', values: voci, ...(detti ? { detti } : {}) } as Capability] : []),
      ...(has(entity, VALVE.SET_POSITION) ? [percent('Apertura', 'position')] : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'valve', valvola(entity).voceDi(entity.state));
    metti(state, 'position', numeric(entity.attributes.current_position));
    return state;
  },
  comandi: {
    valve: ordina('valve', VALVOLA),
    position: servizio('valve', 'set_valve_position', (valore) => ({ position: Number(valore) })),
  },
};
