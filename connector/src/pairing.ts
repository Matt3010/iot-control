import type { LinkedAccount, PairingStep } from '../../shared/protocol.js';
import type { ConnectorConfig } from './config.js';
import { EXTRAS, install, installed } from './extras.js';
import { forget, frameFrom, sourceOf } from './homeassistant.js';

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
          ? 'quello che hai scritto non è stato accettato: ricontrolla l’indirizzo'
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

/** Il primo errore che HA segnala, detto in modo leggibile. */
function errorOf(flow: HaFlow): string | undefined {
  // Il nome del campo conta: «obbligatorio» senza dire quale non aiuta
  // nessuno. «base» invece vuol dire «tutto il modulo», e non si nomina.
  const [where, first] = Object.entries(flow.errors ?? {})[0] ?? [];
  if (!first) return undefined;
  const which = where && where !== 'base' ? `${where}: ` : '';

  // HA dà una chiave ("login_error") e i dettagli a parte: si mettono insieme.
  const detail = Object.values(flow.description_placeholders ?? {})
    .filter((value) => typeof value === 'string' && value)
    .join(' · ');
  return detail ? `${which}${first} · ${detail}` : `${which}${first}`;
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
    return { flowId: flow.flow_id ?? '', kind: 'failed', fields: [], error: flow.reason ?? 'interrotto' };
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

      const value = proposed(entry);
      if (value !== undefined) bits.push(`propone ${JSON.stringify(value)}`);
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

  const flow = await ask(config, FLOWS, {
    method: 'POST',
    body: JSON.stringify({ handler, show_advanced_options: false }),
  });
  return pictured(config, flow, translate(flow));
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

  // Se si e' lamentato, nel registro finisce anche di cosa era fatto il
  // passo: un rifiuto su un campo che non si vede si capisce solo vedendo
  // quali campi c'erano e cosa proponevano.
  if (step.error) console.warn(`passo ${flowId}: ${listed(schema)}`);
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

  const entries = (await response.json()) as { entry_id: string; domain: string; title: string }[];
  // «generic» sono le telecamere: una per canale, e ognuna si stacca per conto
  // suo. Senza di loro nell'elenco, una telecamera si poteva collegare e non
  // scollegare piu' — e sbagliare canale capita al primo tentativo.
  const ours = new Set(['tuya', 'generic', ...Object.keys(EXTRAS)]);

  return entries
    .filter((entry) => ours.has(entry.domain))
    .map((entry) => ({ handler: entry.domain, title: entry.title, entryId: entry.entry_id }));
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
      const raw = eye ? await sourceOf(eye) : undefined;
      if (!raw) return one;

      try {
        const where = new URL(raw);
        return { ...one, title: `${where.hostname}${where.pathname}` };
      } catch {
        return one;
      }
    }),
  );
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
  await fetch(`${config.haUrl}${FLOWS}/${flowId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${config.haToken}` },
  }).catch(() => undefined);
}
