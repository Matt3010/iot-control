import type { PairingStep } from '../../shared/protocol.js';
import type { ConnectorConfig } from './config.js';
import { EXTRAS, install, installed } from './extras.js';

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
    throw new Error(`home assistant: ${response.status} ${text.slice(0, 120)}`);
  }
  return JSON.parse(text) as HaFlow;
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
    .filter((entry) => entry.type === 'string' || entry.type === 'integer' || entry.type === 'select')
    .map((entry) => {
      const options = optionsOf(entry);
      return {
        name: String(entry.name),
        required: entry.required === true,
        ...(isSecret(entry) ? { secret: true } : {}),
        ...(options ? { options } : {}),
      };
    });
}

/** Il primo errore che HA segnala, detto in modo leggibile. */
function errorOf(flow: HaFlow): string | undefined {
  const first = Object.values(flow.errors ?? {})[0];
  if (!first) return undefined;

  // HA dà una chiave ("login_error") e i dettagli a parte: si mettono insieme.
  const detail = Object.values(flow.description_placeholders ?? {})
    .filter((value) => typeof value === 'string' && value)
    .join(' · ');
  return detail ? `${first}: ${detail}` : first;
}

function translate(flow: HaFlow): PairingStep {
  // Senza `type` non è un passo: è HA che dice che la conversazione non c'è
  // più — scaduta, o annullata da un'altra finestra. Dirlo è meglio che
  // mostrare un modulo vuoto e lasciare chi guarda a fissarlo.
  if (!flow.type) {
    return { flowId: '', kind: 'failed', fields: [], error: flow.message ?? 'la richiesta è scaduta' };
  }

  if (flow.type === 'create_entry') {
    return { flowId: flow.flow_id ?? '', kind: 'done', fields: [] };
  }
  if (flow.type === 'abort') {
    return { flowId: flow.flow_id ?? '', kind: 'failed', fields: [], error: flow.reason ?? 'interrotto' };
  }

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
      note: `Sto aggiungendo il supporto ${extra.label} a Home Assistant, che si sta riavviando. Ci vuole un minuto.`,
    };
  }

  return translate(
    await ask(config, FLOWS, {
      method: 'POST',
      body: JSON.stringify({ handler, show_advanced_options: false }),
    }),
  );
}

export async function submitPairing(
  config: ConnectorConfig,
  flowId: string,
  input: Record<string, string>,
): Promise<PairingStep> {
  return translate(await ask(config, `${FLOWS}/${flowId}`, { method: 'POST', body: JSON.stringify(input) }));
}

/** Lasciare a metà una conversazione la lascia aperta in HA: meglio chiuderla. */
export async function cancelPairing(config: ConnectorConfig, flowId: string): Promise<void> {
  await fetch(`${config.haUrl}${FLOWS}/${flowId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${config.haToken}` },
  }).catch(() => undefined);
}
