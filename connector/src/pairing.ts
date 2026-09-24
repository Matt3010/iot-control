import type { Health, LinkedAccount, PairingStep } from '../../shared/protocol.js';
import fs from 'node:fs';
import { stateFile, type ConnectorConfig } from './config.js';
import { EXTRAS, install, installed } from './extras.js';
import { lastSeen } from './eyes.js';
import { channelOf, forget } from './go2rtc.js';
import { frameFrom } from './homeassistant.js';

/**
 * Collegare un account a Home Assistant, pilotato da fuori.
 *
 * HA chiama "config flow" una conversazione a più battute: chiedi qualcosa,
 * rispondi, ti chiede altro, finisce. Per Tuya sono due battute — un codice
 * che sta nell'app Smart Life, e poi un QR da scansionare — ma qui dentro non
 * c'è niente di Tuya: si traduce quello che HA dice in un passo con dei campi
 * e, se c'è, una stringa da disegnare.
 *
 * Il QR non arriva come immagine: HA manda la stringa da codificare. Meglio,
 * perché i pixel li disegna chi ha buon gusto, e non noi.
 */

const FLOWS = '/api/config/config_entries/flow';

/**
 * Lo schema dell'ultimo passo, per conversazione.
 *
 * Certi campi sono obbligatori e hanno gia' la risposta giusta dentro: la
 * telecamera generica vuole «framerate», e il valore buono e' quello che
 * propone lei. Non si mostrano — chiedere a una persona quanti fotogrammi al
 * secondo vuole, per poi suggerirle l'unica risposta sensata, e' farle
 * perdere tempo — e certi non si saprebbe nemmeno come disegnarli, perche'
 * arrivano senza tipo. Ma se non si rimandano indietro, la richiesta viene
 * rifiutata per un campo che nessuno ha mai visto, e chi scrive resta a
 * fissare un modulo che gli sembra pieno.
 */
const SCHEMAS = new Map<string, unknown[]>();

/**
 * Com'e' fatto il passo in corso: prima da quello che ricordiamo, se no si
 * chiede.
 *
 * La memoria di questo processo non sopravvive a un riavvio, e un modulo
 * aperto nel browser si'. Ridomandarlo costa una domanda sola, e toglie di
 * mezzo un intero modo di sbagliare.
 */
async function schemaOf(config: ConnectorConfig, flowId: string): Promise<unknown[] | undefined> {
  const known = SCHEMAS.get(flowId);
  if (known) return known;

  const flow = await ask(config, `${FLOWS}/${flowId}`).catch(() => undefined);
  if (!flow || !Array.isArray(flow.data_schema)) return undefined;

  SCHEMAS.set(flowId, flow.data_schema);
  return flow.data_schema;
}

/**
 * Quello che il passo propone per un campo.
 *
 * Sta in due posti diversi, e la differenza non e' un capriccio: `default` e'
 * quello che vale se non rispondi, `suggested_value` e' quello che ti si
 * scrive gia' nella casella perche' tu lo confermi. Per chi guarda sono la
 * stessa cosa — c'e' scritto due, e due va bene — ma un campo obbligatorio
 * con solo un suggerimento va rimandato indietro lo stesso, se no viene
 * rifiutato per non aver risposto a una domanda che aveva gia' la risposta
 * scritta dentro.
 */
function proposed(entry: Record<string, unknown>): unknown {
  if (entry.default !== undefined && entry.default !== null) return entry.default;

  const described = entry.description as Record<string, unknown> | undefined;
  const suggested = described?.suggested_value;
  return suggested === null ? undefined : suggested;
}

/** Quello che non e' stato chiesto torna com'era proposto. */
function withDefaults(
  schema: unknown[] | undefined,
  input: Record<string, string | boolean>,
): Record<string, unknown> {
  const full: Record<string, unknown> = { ...input };
  if (!Array.isArray(schema)) return full;

  for (const entry of schema) {
    if (!entry || typeof entry !== 'object') continue;
    const field = entry as Record<string, unknown>;
    const name = String(field.name ?? '');
    if (!name || name in full) continue;

    const value = proposed(field);
    if (value !== undefined) full[name] = value;
  }
  return full;
}

interface HaFlow {
  type: string;
  flow_id?: string;
  step_id?: string;
  data_schema?: unknown[];
  errors?: Record<string, string>;
  description_placeholders?: Record<string, unknown> | null;
  reason?: string;
  /** Quando non è un passo ma una lamentela: «questa conversazione non esiste». */
  message?: string;
}

async function ask(config: ConnectorConfig, path: string, options: RequestInit = {}): Promise<HaFlow> {
  const response = await fetch(`${config.haUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${config.haToken}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  // Un 400 è HA che dice "così non va": il corpo spiega, e vale la pena leggerlo.
  const text = await response.text();
  if (!response.ok && !text.startsWith('{')) {
    console.warn(`configurazione ${path}: ${response.status} — ${text.slice(0, 300)}`);
    throw new Error(`non si riesce a collegarlo (${response.status})`);
  }

  const flow = JSON.parse(text) as HaFlow;
  if (!response.ok) {
    // Per intero nel registro di questa macchina: e' l'unico posto dove si
    // puo' guardare davvero cos'e' andato storto, e l'unico dove il nome di
    // chi l'ha detto non da' fastidio a nessuno.
    console.warn(`configurazione ${path}: ${response.status} — ${text.slice(0, 300)}`);

    // A chi guarda si dice cosa fare, non chi si e' lamentato. Un rifiuto
    // senza spiegazione diventerebbe «la richiesta e' scaduta», che e'
    // un'ipotesi; il numero da solo non aiuta nessuno.
    if (!flow.message) {
      flow.message =
        response.status === 400
          ? 'quello che hai scritto non è stato accettato, ricontrolla i dati'
          : `non si riesce a collegarlo (${response.status})`;
    }
  }
  return flow;
}

/**
 * Nello schema di un passo HA mette sia i campi da riempire sia i selettori.
 * Il QR è un selettore, e la stringa da disegnare sta in fondo alla sua
 * configurazione. Si cerca in profondità perché la forma esatta è cambiata
 * fra una versione e l'altra, e una ricerca tollerante invecchia meglio di
 * un percorso preciso.
 */
function findQr(value: unknown, depth = 0): string | undefined {
  if (depth > 6 || !value || typeof value !== 'object') return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findQr(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const qr = record.qr_code;
  if (qr && typeof qr === 'object' && typeof (qr as Record<string, unknown>).data === 'string') {
    return (qr as Record<string, string>).data;
  }
  // certe versioni la mettono direttamente come `data` accanto a un tipo qr
  if (record.type === 'qr_code' && typeof record.data === 'string') return record.data;

  for (const nested of Object.values(record)) {
    const found = findQr(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * Un campo da non scrivere in chiaro. HA lo dice nel suo selettore, ma non
 * tutte le integrazioni lo fanno — e una password mostrata a schermo mentre
 * la digiti in un locale è una password letta da qualcun altro. Nel dubbio,
 * si guarda anche il nome.
 */
function isSecret(entry: Record<string, unknown>): boolean {
  if (/password|secret|token|api_?key/i.test(String(entry.name))) return true;
  const selector = entry.selector as Record<string, Record<string, unknown>> | undefined;
  return selector?.text?.type === 'password';
}

/**
 * Un elenco da cui scegliere. HA li manda come coppie [valore, etichetta] —
 * eWeLink chiede il prefisso del paese così — oppure come oggetti, a seconda
 * dell'integrazione: si accettano entrambe.
 */
function optionsOf(entry: Record<string, unknown>): PairingStep['fields'][number]['options'] {
  const raw = entry.options;
  if (!Array.isArray(raw) || !raw.length) return undefined;

  return raw
    .map((option) => {
      if (Array.isArray(option)) return { value: String(option[0]), label: String(option[1] ?? option[0]) };
      if (option && typeof option === 'object') {
        const record = option as Record<string, unknown>;
        return { value: String(record.value), label: String(record.label ?? record.value) };
      }
      return { value: String(option), label: String(option) };
    })
    .filter((option) => option.value && option.value !== 'undefined');
}

/** I campi da riempire: caselle ed elenchi, non i selettori che non si compilano. */
function fieldsOf(schema: unknown[] | undefined): PairingStep['fields'] {
  if (!Array.isArray(schema)) return [];

  return schema
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .filter((entry) => !!entry.name)
    .filter(
      (entry) =>
        entry.type === 'string' ||
        entry.type === 'integer' ||
        entry.type === 'select' ||
        entry.type === 'boolean',
    )
    .map((entry) => {
      const options = optionsOf(entry);
      const preset = proposed(entry);
      return {
        name: String(entry.name),
        required: entry.required === true,
        ...(isSecret(entry) ? { secret: true } : {}),
        ...(options ? { options } : {}),
        ...(entry.type === 'boolean' ? { yesno: true } : {}),
        ...(typeof preset === 'string' || typeof preset === 'boolean' ? { preset } : {}),
      };
    });
}

/**
 * Le parole di un guasto, dette come si direbbero a voce.
 *
 * Di la' le chiamano per chiave — `invalid_auth`, `already_in_progress` — e
 * accanto ci mettono il testo dell'eccezione che le ha causate. Quella roba
 * non deve arrivare a chi guarda: non e' scritta per lui, non e' nella sua
 * lingua, e la meta' delle volte non dice nemmeno cosa fare.
 */
const PAROLE: Record<string, string> = {
  invalid_auth: 'Utente o password non vanno.',
  invalid_credentials: 'Utente o password non vanno.',
  cannot_connect: 'Non si riesce a raggiungere quel servizio da casa tua.',
  timeout: 'Quel servizio non ha risposto in tempo.',
  timeout_connect: 'Quel servizio non ha risposto in tempo.',
  already_configured: 'Questo account risulta già collegato.',
  already_in_progress: 'C’era un collegamento lasciato a metà. Riprova adesso.',
  reauth_unsuccessful: 'Quel servizio ha chiesto di rifare l’accesso, e non è riuscito.',
  no_devices_found: 'Non ha trovato niente da collegare.',
  unknown: 'Quel servizio ha risposto in un modo che non ci aspettavamo.',
  template: 'Quel servizio ha risposto in un modo che non ci aspettavamo.',
};

/**
 * Il motivo vero, quando sta dentro al testo dell'eccezione.
 *
 * Certe integrazioni rispondono sempre con la stessa chiave — quella di
 * eWeLink dice «template» sia per una password sbagliata sia per un
 * tentativo rimasto aperto — e quello che e' successo davvero e' scritto solo
 * dentro il testo dell'eccezione. Si guarda li' dentro, invece di dire
 * sempre la stessa cosa a tutti.
 */
const CASTIGO = 'Quel servizio ha messo in pausa gli accessi. Riprova fra qualche minuto.';

function dentro(testo: string): string | undefined {
  for (const chiave of Object.keys(PAROLE)) {
    if (testo.includes(chiave)) return PAROLE[chiave];
  }
  /*
   * I numeri si riconoscono solo nella forma in cui arrivano davvero —
   * `'error': 401` — e non dovunque compaiano. Un 401 dentro al numero di
   * serie di una presa non vuol dire che la password sia sbagliata, e dire a
   * qualcuno una cosa falsa con sicurezza e' peggio che dirgli che non si sa.
   */
  const numero = /["']?(error|code|status|errno)["']?\s*[:=]\s*["']?(\d{3,5})/i.exec(testo);
  const quale = numero ? Number(numero[2]) : 0;
  if (quale === 401 || quale === 403) return PAROLE.invalid_auth;
  if (quale === 429) return CASTIGO;
  if (/too many requests|rate limit/i.test(testo)) return CASTIGO;

  return undefined;
}

/** Se un dettaglio e' una frase o un pezzo di codice buttato li'. */
const leggibile = (testo: string): boolean =>
  !/[(){}[\]<>]|https?:\/\/|Error|Exception|Traceback|^[a-z_]+$/.test(testo.trim());

/** Il primo errore che l'impianto segnala, detto in modo leggibile. */
function errorOf(flow: HaFlow): string | undefined {
  // Il nome del campo conta: «obbligatorio» senza dire quale non aiuta
  // nessuno. «base» invece vuol dire «tutto il modulo», e non si nomina.
  const [where, first] = Object.entries(flow.errors ?? {})[0] ?? [];
  if (!first) return undefined;
  const which = where && where !== 'base' ? `${where}: ` : '';

  const crudo = Object.values(flow.description_placeholders ?? {})
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  const detto = dentro(crudo) ?? PAROLE[first] ?? first;

  // I dettagli si tengono solo se sono una frase: il testo di un'eccezione e
  // un indirizzo di un sito, in fondo a un messaggio, sono rumore che spaventa.
  const detail = Object.values(flow.description_placeholders ?? {})
    .filter((value): value is string => typeof value === 'string' && !!value && leggibile(value))
    .join(' · ');
  return detail ? `${which}${detto} ${detail}` : `${which}${detto}`;
}

function translate(flow: HaFlow, going?: { flowId: string; schema?: unknown[] }): PairingStep {
  if (!flow.type) {
    /*
     * Un rifiuto sui campi non e' la fine della conversazione: quella e'
     * ancora aperta di la', e basta correggere. Si rimette lo stesso modulo
     * con scritto cosa non andava, invece di far ricominciare da capo.
     */
    const wrong = errorOf(flow);
    if (wrong && going?.flowId) {
      return { flowId: going.flowId, kind: 'form', fields: fieldsOf(going.schema), error: wrong };
    }

    // Senza type e senza lamentele sui campi non e' un passo: e' la
    // conversazione che non c'e' piu' — scaduta, o chiusa da un'altra
    // finestra. Dirlo e' meglio che mostrare un modulo vuoto.
    return { flowId: '', kind: 'failed', fields: [], error: flow.message ?? 'la richiesta è scaduta' };
  }

  if (flow.type === 'create_entry') {
    if (flow.flow_id) SCHEMAS.delete(flow.flow_id);
    return { flowId: flow.flow_id ?? '', kind: 'done', fields: [] };
  }
  if (flow.type === 'abort') {
    if (flow.flow_id) SCHEMAS.delete(flow.flow_id);
    const perche = flow.reason ?? '';
    return {
      flowId: flow.flow_id ?? '',
      kind: 'failed',
      fields: [],
      error: PAROLE[perche] ?? (perche && leggibile(perche) ? perche : 'il collegamento si è interrotto'),
    };
  }

  // Si tiene com'era: al passo dopo serve per rispondere anche di quello che
  // non e' stato chiesto.
  if (flow.flow_id && Array.isArray(flow.data_schema)) SCHEMAS.set(flow.flow_id, flow.data_schema);

  const step: PairingStep = {
    flowId: flow.flow_id ?? '',
    kind: 'form',
    fields: fieldsOf(flow.data_schema),
  };

  const qr = findQr(flow.data_schema) ?? findQr(flow.description_placeholders);
  if (qr) step.qr = qr;

  const error = errorOf(flow);
  if (error) step.error = error;
  return step;
}

/** Quanto si aspetta un fotogramma di prova: come tutti, aspetta la telecamera. */
const PREVIEW_TIMEOUT_MS = 20_000;

/**
 * Il fotogramma che il passo propone di guardare, se ce n'e' uno.
 *
 * Prima di creare una telecamera, il passo di conferma tiene da parte uno
 * scatto e ne dice l'indirizzo. Quell'indirizzo da fuori non si puo' aprire —
 * vuole il permesso di casa — quindi l'immagine la si prende qui e la si
 * manda su insieme al passo: chi deve confermare la vede, e conferma qualcosa
 * invece di confermare e basta.
 */
async function pictured(config: ConnectorConfig, flow: HaFlow, step: PairingStep): Promise<PairingStep> {
  const where = flow.description_placeholders?.preview_url;
  if (typeof where !== 'string' || !where) return step;

  const shot = await fetch(`${config.haUrl}${where}`, {
    headers: { authorization: `Bearer ${config.haToken}` },
    signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
  }).catch(() => undefined);

  if (!shot?.ok) {
    // Senza scatto si va avanti lo stesso: il passo resta, e chi guarda legge
    // che l'immagine non e' arrivata. Meglio che non mostrare il passo.
    console.warn(`fotogramma di prova: ${shot ? shot.status : 'non risponde'}`);
    return step;
  }

  const bytes = Buffer.from(await shot.arrayBuffer());
  if (!bytes.length) return step;
  return { ...step, preview: bytes.toString('base64') };
}

/** Il nome del flusso che si apre solo per far vedere una prova. */
const TRYING = 'prova-collegamento';

/**
 * Lo scatto per il passo che chiede «e' questa?», quando nessuno ce lo da'.
 *
 * Certe versioni di Home Assistant l'anteprima non la mettono a un indirizzo
 * che si possa aprire: se la tengono su un canale loro. Chi guarda si
 * ritrova una levetta che dice «l'immagine e' quella giusta» e nessuna
 * immagine — la stessa domanda a occhi chiusi di prima.
 *
 * Ma l'indirizzo del flusso lo ha appena scritto la persona, ed e' tutto
 * quello che serve per andarselo a prendere. Si apre un flusso apposta, si
 * scatta, e lo si richiude: quello che si guarda e' la telecamera vera, non
 * una promessa.
 */
async function ourShot(step: PairingStep, input: Record<string, string | boolean>): Promise<PairingStep> {
  const asks = step.kind === 'form' && step.fields.some((field) => field.name === 'confirmed_ok');
  const raw = input.stream_source;
  if (step.preview || !asks || typeof raw !== 'string' || !raw.startsWith('rtsp://')) return step;

  const shot = await frameFrom(raw, TRYING);
  await forget(TRYING);
  if (!shot) {
    console.warn(`prova di ${raw}: nessun fotogramma`);
    return step;
  }
  return { ...step, preview: shot.toString('base64') };
}

/** Uno schema detto in una riga: i nomi, e cosa propongono. */
function listed(schema: unknown[] | undefined): string {
  if (!Array.isArray(schema)) return 'nessuno schema';

  return schema
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => {
      const bits = [String(entry.name)];
      if (entry.required === true) bits.push('obbligatorio');

      /*
       * Il valore proposto si scrive, tranne quando è un segreto.
       *
       * Una password nel registro di una macchina di casa e' una password
       * scritta in chiaro su un disco, che resta li' e finisce dentro a
       * qualunque copia di quei log. Qui serve sapere se il campo era pieno o
       * vuoto, non cosa c'era scritto.
       */
      const value = proposed(entry);
      if (value !== undefined) {
        bits.push(isSecret(entry) ? 'già compilato' : `propone ${JSON.stringify(value)}`);
      }
      if (entry.type !== undefined) bits.push(`tipo ${String(entry.type)}`);
      return bits.join(' ');
    })
    .join(' | ');
}

/** Quali account Home Assistant sa collegare, adesso. */
async function handlers(config: ConnectorConfig): Promise<string[]> {
  const response = await fetch(`${config.haUrl}/api/config/config_entries/flow_handlers`, {
    headers: { authorization: `Bearer ${config.haToken}` },
  });
  return response.ok ? ((await response.json()) as string[]) : [];
}

export async function startPairing(config: ConnectorConfig, handler: string): Promise<PairingStep> {
  // Certe integrazioni HA non ce l'ha di serie: si installano al volo, la
  // prima volta che qualcuno le chiede, e non prima.
  const extra = EXTRAS[handler];
  if (extra && !(await handlers(config)).includes(handler)) {
    if (!(await installed(config, extra))) await install(config, extra);
    return {
      flowId: '',
      kind: 'busy',
      fields: [],
      note: `Sto aggiungendo il supporto ${extra.label} su quella macchina, che si sta riavviando. Ci vuole un minuto.`,
    };
  }

  /*
   * Una conversazione lasciata a meta' resta aperta di la' — una finestra
   * chiusa, un telefono che si spegne — e alla prossima si sente rispondere
   * che ce n'e' gia' una in corso. Chi guarda non puo' saperlo e non puo'
   * farci niente: la si chiude e si ricomincia.
   */
  await forgetOpen(config, handler);

  const flow = await ask(config, FLOWS, {
    method: 'POST',
    body: JSON.stringify({ handler, show_advanced_options: false }),
  });
  if (flow.flow_id && flow.type === 'form') ricorda(config, flow.flow_id, handler);
  return pictured(config, flow, translate(flow));
}

/**
 * Le conversazioni che abbiamo aperto noi e che non si sono chiuse.
 *
 * Una lasciata a meta' resta aperta di la' con dentro il nome dell'account, e
 * al tentativo dopo ci si sente rispondere che ce n'e' gia' una in corso —
 * per sempre, finche' non si riavvia tutto. Quindi si chiude prima di
 * cominciarne un'altra.
 *
 * Si tiene l'elenco da soli perche' non c'e' altro modo: l'indirizzo HTTP che
 * le elencherebbe accetta solo POST, e il filo aperto elenca solo quelle che
 * nascono da sole, non quelle che apre qualcuno. Sta anche su un file, se no
 * un aggiornamento del connettore nel mezzo di un collegamento lascerebbe
 * quella conversazione aperta per sempre.
 */
const APERTE = new Map<string, string>();

function ricorda(config: ConnectorConfig, flowId: string, handler: string): void {
  APERTE.set(flowId, handler);
  salva(config);
}

function scorda(config: ConnectorConfig, flowId: string): void {
  if (APERTE.delete(flowId)) salva(config);
}

function salva(config: ConnectorConfig): void {
  try {
    fs.writeFileSync(stateFile(config, 'aperte.json'), JSON.stringify([...APERTE]), 'utf8');
  } catch {
    // Se non si riesce a scrivere si va avanti lo stesso: e' un promemoria,
    // non un dato.
  }
}

function rileggi(config: ConnectorConfig): void {
  if (APERTE.size) return;
  try {
    const righe = JSON.parse(fs.readFileSync(stateFile(config, 'aperte.json'), 'utf8')) as [string, string][];
    for (const [flowId, handler] of righe) APERTE.set(flowId, handler);
  } catch {
    // niente file, niente da ricordare
  }
}

/** Chiude quelle rimaste aperte per quel servizio. */
async function forgetOpen(config: ConnectorConfig, handler: string): Promise<void> {
  rileggi(config);
  const sue = [...APERTE].filter(([, chi]) => chi === handler).map(([flowId]) => flowId);
  await Promise.all(sue.map((flowId) => cancelPairing(config, flowId)));
  for (const flowId of sue) scorda(config, flowId);
}

export async function submitPairing(
  config: ConnectorConfig,
  flowId: string,
  input: Record<string, string | boolean>,
): Promise<PairingStep> {
  const schema = await schemaOf(config, flowId);
  const body = JSON.stringify(withDefaults(schema, input));
  const flow = await ask(config, `${FLOWS}/${flowId}`, { method: 'POST', body });
  const step = translate(flow, { flowId, schema });

  // Finita o andata storta, quella conversazione non e' piu' aperta: non c'e'
  // niente da chiudere la prossima volta.
  if (step.kind === 'done' || step.kind === 'failed') scorda(config, flowId);

  /*
   * «Ce n'e' gia' una in corso» vuol dire che un nostro tentativo di prima e'
   * rimasto aperto con dentro lo stesso account. Si chiudono gli altri e si
   * riprova una volta sola: chi guarda non deve imparare che esiste questa
   * roba, e non potrebbe comunque farci niente.
   */
  const bloccata = JSON.stringify(flow.description_placeholders ?? {}).includes('already_in_progress');
  const handler = APERTE.get(flowId);
  if (step.error && bloccata && handler) {
    const altre = [...APERTE].filter(([id, chi]) => chi === handler && id !== flowId).map(([id]) => id);
    if (altre.length) {
      await Promise.all(altre.map((id) => cancelPairing(config, id)));
      const ancora = await ask(config, `${FLOWS}/${flowId}`, { method: 'POST', body });
      const dopo = translate(ancora, { flowId, schema });
      if (dopo.kind === 'done' || dopo.kind === 'failed') scorda(config, flowId);
      return ourShot(await pictured(config, ancora, dopo), input);
    }
  }

  /*
   * Se si e' lamentato, nel registro finisce tutto quello che ha detto: di
   * cosa era fatto il passo — un rifiuto su un campo che non si vede si
   * capisce solo sapendo quali campi c'erano — e le parole esatte del
   * guasto, comprese quelle che a chi guarda non si mostrano.
   *
   * Certe integrazioni infilano l'eccezione dentro i segnaposti: sullo
   * schermo sarebbe rumore, ma qui e' l'unica cosa che dice cosa e'
   * successo davvero. Ed e' su una macchina di casa, non in giro.
   */
  if (step.error) {
    console.warn(`passo ${flowId}: ${listed(schema)}`);
    console.warn(`passo ${flowId}, com'e' andata: ${JSON.stringify(flow.errors ?? {})} ${JSON.stringify(flow.description_placeholders ?? {})}`);
  }
  return ourShot(await pictured(config, flow, step), input);
}

/**
 * Cosa è già collegato. Si guarda solo fra quelli che sappiamo offrire: le
 * altre voci sono roba di Home Assistant — il sole, i backup, la radio — e
 * non sono account di nessuno.
 */
export async function listLinked(config: ConnectorConfig): Promise<LinkedAccount[]> {
  const response = await fetch(`${config.haUrl}/api/config/config_entries/entry`, {
    headers: { authorization: `Bearer ${config.haToken}` },
  });
  if (!response.ok) return [];

  const entries = (await response.json()) as {
    entry_id: string;
    domain: string;
    title: string;
    state?: string;
  }[];
  // «generic» sono le telecamere: una per canale, e ognuna si stacca per conto
  // suo. Senza di loro nell'elenco, una telecamera si poteva collegare e non
  // scollegare piu' — e sbagliare canale capita al primo tentativo.
  const ours = new Set(['tuya', 'generic', ...Object.keys(EXTRAS)]);

  return entries
    .filter((entry) => ours.has(entry.domain))
    .map((entry) => ({
      handler: entry.domain,
      title: entry.title,
      entryId: entry.entry_id,
      health: howIs(entry.state),
    }));
}

/**
 * Alle telecamere Home Assistant da' tutte lo stesso nome.
 *
 * Le chiama come il registratore da cui vengono — e vengono tutte dallo
 * stesso — quindi in elenco diventano tre righe identiche, e staccare
 * «quella giusta» e' un indovinello. Quello che le distingue e' il canale,
 * che poi e' esattamente quello che la persona ha scritto per collegarle:
 * si rimette li' davanti.
 */
export async function titled(
  list: LinkedAccount[],
  born: Map<string, string>,
): Promise<LinkedAccount[]> {
  if (!list.some((one) => one.handler === 'generic')) return list;

  const eyes = new Map<string, string>();
  for (const [entityId, entryId] of born) {
    if (entityId.startsWith('camera.') && !eyes.has(entryId)) eyes.set(entryId, entityId);
  }

  return Promise.all(
    list.map(async (one) => {
      if (one.handler !== 'generic') return one;

      const eye = eyes.get(one.entryId);
      if (!eye) return one;

      const canale = await channelOf(eye);
      /*
       * E come sta, con lo stesso metro del pallino sul dispositivo.
       *
       * Qui sotto arrivava lo stato dell'integrazione: «caricata», che resta
       * vera anche col registratore morto. Ma ognuna di queste righe è una
       * telecamera — una per canale — e due pallini sulla stessa cosa che
       * dicono il contrario tolgono valore a tutti e due.
       */
      const visto = lastSeen(eye);
      return {
        ...one,
        ...(canale ? { title: canale } : {}),
        ...(visto === undefined ? {} : { health: visto ? ('live' as Health) : ('lost' as Health) }),
      };
    }),
  );
}

/**
 * Come sta un collegamento, detto con le parole di qui.
 *
 * Di la' gli stati sono sei e hanno nomi loro. A chi guarda servono quattro
 * colori: va, ci sta riprovando, non ce la fa, e' spento. Il resto e'
 * vocabolario di casa d'altri.
 */
function howIs(state: string | undefined): Health {
  if (state === 'loaded') return 'live';
  if (state === 'setup_retry') return 'degraded';
  if (state === 'not_loaded' || !state) return 'new';
  return 'lost';
}

/**
 * Staccare un account. Home Assistant si porta via anche i suoi dispositivi,
 * e l'agente se ne accorge da solo: l'anagrafe cambia, e l'inventario che
 * sale è già senza.
 */
export async function unlink(config: ConnectorConfig, entryId: string): Promise<void> {
  const response = await fetch(`${config.haUrl}/api/config/config_entries/entry/${entryId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${config.haToken}` },
  });
  if (!response.ok) throw new Error(`non si riesce a scollegare: ${response.status}`);
}

/** Lasciare a metà una conversazione la lascia aperta in HA: meglio chiuderla. */
export async function cancelPairing(config: ConnectorConfig, flowId: string): Promise<void> {
  SCHEMAS.delete(flowId);
  APERTE.delete(flowId);
  await fetch(`${config.haUrl}${FLOWS}/${flowId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${config.haToken}` },
  }).catch(() => undefined);
}
