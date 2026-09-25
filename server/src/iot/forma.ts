import type {
  AgentMessage,
  Capability,
  DeviceSnapshot,
  DeviceValue,
  Health,
  LinkedAccount,
} from '../../../shared/protocol.js';

/**
 * La forma dei messaggi di un agente, controllata sulla porta.
 *
 * Esiste perché un agente è un programma là fuori, di una versione che non
 * decidiamo noi, e quello che manda finiva così com'era nell'archivio e in
 * memoria. Un dispositivo con le capacità scritte come un oggetto invece che
 * come un elenco restava salvato e rompeva l'indice a ogni inventario, per
 * sempre; uno stato senza `state` rompeva il sito e faceva perdere il
 * passaggio dopo. Qui passa solo quello che ha la forma del protocollo
 * (`shared/protocol.d.ts`), rifatto campo per campo: il resto si scarta e si
 * dice cosa, così da qui in giù nessuno deve più chiedersi se un elenco è un
 * elenco. Le voci ripetute di un elenco si tolgono qui, una volta per tutti.
 */

/** Quello che resta di un messaggio, e cosa se n'è scartato, in parole da registro. */
export interface Letto {
  message?: AgentMessage;
  scarti: string[];
}

type Grezzo = Record<string, unknown>;

const oggetto = (value: unknown): value is Grezzo => typeof value === 'object' && value !== null && !Array.isArray(value);
const testo = (value: unknown): value is string => typeof value === 'string';
const pieno = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const numero = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Un elenco di parole, senza doppioni e senza quello che parola non è. Vuoto se non è un elenco. */
function parole(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(testo))] : [];
}

/** Un dizionario di parole: solo le voci che sono parole. */
function dizionario(value: unknown): Record<string, string> | undefined {
  if (!oggetto(value)) return undefined;
  const voci = Object.entries(value).filter((voce): voce is [string, string] => testo(voce[1]));
  return voci.length ? Object.fromEntries(voci) : undefined;
}

/** Un valore che un dispositivo può avere: testo, un numero vero, sì o no. */
const valore = (value: unknown): value is DeviceValue => testo(value) || numero(value) || typeof value === 'boolean';

/** Lo stato, con solo le letture che hanno la forma di un valore. `undefined` se non è un dizionario. */
function stato(value: unknown): Record<string, DeviceValue> | undefined {
  if (!oggetto(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter((voce): voce is [string, DeviceValue] => valore(voce[1])));
}

/** Una capacità rifatta con i soli campi del protocollo, o `undefined` se non ne ha la forma. */
function capacita(grezza: unknown): Capability | undefined {
  if (!oggetto(grezza) || !pieno(grezza.code) || !testo(grezza.label)) return undefined;
  const base = { code: grezza.code, label: grezza.label, ...(grezza.setting === true ? { setting: true } : {}) };
  const unit = testo(grezza.unit) ? { unit: grezza.unit } : {};
  const accende = pieno(grezza.accende) ? { accende: grezza.accende } : {};
  const labels = dizionario(grezza.labels);

  switch (grezza.kind) {
    case 'switch':
      return { ...base, kind: 'switch', ...(numero(grezza.pulse) && grezza.pulse > 0 ? { pulse: grezza.pulse } : {}) };
    case 'image':
      return { ...base, kind: 'image' };
    case 'color':
      return { ...base, kind: 'color', ...accende };
    case 'range': {
      const { min, max, step } = grezza;
      if (!numero(min) || !numero(max) || !numero(step) || min > max || step < 0) return undefined;
      return { ...base, kind: 'range', min, max, step, ...unit, ...accende };
    }
    case 'enum': {
      const values = parole(grezza.values);
      if (!values.length) return undefined;
      const detti = oggetto(grezza.detti)
        ? Object.fromEntries(
            Object.entries(grezza.detti).filter(
              (voce): voce is [string, { se: string; quando: string }] =>
                oggetto(voce[1]) && testo(voce[1].se) && testo(voce[1].quando),
            ).map(([voce, detto]) => [voce, { se: detto.se, quando: detto.quando }]),
          )
        : {};
      return {
        ...base,
        kind: 'enum',
        values,
        ...(labels ? { labels } : {}),
        ...(grezza.order === true ? { order: true as const } : {}),
        ...(Object.keys(detti).length ? { detti } : {}),
      };
    }
    case 'sensor': {
      const values = parole(grezza.values);
      return {
        ...base,
        kind: 'sensor',
        ...unit,
        ...(values.length ? { values } : {}),
        ...(labels ? { labels } : {}),
        ...(grezza.event === true ? { event: true } : {}),
      };
    }
    default:
      return undefined;
  }
}

/** Un dispositivo rifatto, con le sole capacità che hanno la forma; `undefined` se lui non ce l'ha. */
function dispositivo(grezzo: unknown, scarti: string[]): DeviceSnapshot | undefined {
  if (!oggetto(grezzo) || !pieno(grezzo.externalId)) {
    scarti.push('un dispositivo senza il suo identificativo');
    return undefined;
  }
  const chi = grezzo.externalId;
  const state = stato(grezzo.state);
  if (!Array.isArray(grezzo.capabilities) || typeof grezzo.online !== 'boolean' || !state) {
    scarti.push(`il dispositivo «${chi}», che non ha la forma del protocollo`);
    return undefined;
  }

  const capabilities: Capability[] = [];
  for (const grezza of grezzo.capabilities) {
    const una = capacita(grezza);
    const codice = oggetto(grezza) && testo(grezza.code) ? grezza.code : '?';
    if (!una) scarti.push(`la capacità «${codice}» del dispositivo «${chi}»`);
    // lo stesso codice due volte vorrebbe dire due cose diverse con lo stesso nome: vale la prima
    else if (capabilities.some((one) => one.code === una.code)) scarti.push(`una seconda capacità con il codice «${codice}» nel dispositivo «${chi}»`);
    else capabilities.push(una);
  }

  return {
    externalId: chi,
    name: pieno(grezzo.name) ? grezzo.name : chi,
    online: grezzo.online,
    capabilities,
    state,
    ...(Array.isArray(grezzo.absorbs) ? { absorbs: parole(grezzo.absorbs) } : {}),
  };
}

/** Un elenco di dispositivi, senza quelli senza forma. `undefined` se non è un elenco. */
function dispositivi(value: unknown, scarti: string[]): DeviceSnapshot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: DeviceSnapshot[] = [];
  for (const grezzo of value) {
    const uno = dispositivo(grezzo, scarti);
    if (uno) out.push(uno);
  }
  return out;
}

const SALUTI: readonly Health[] = ['live', 'degraded', 'lost', 'new'];

function account(grezzo: unknown): LinkedAccount | undefined {
  if (!oggetto(grezzo) || !pieno(grezzo.handler) || !testo(grezzo.title) || !pieno(grezzo.entryId)) return undefined;
  return {
    handler: grezzo.handler,
    title: grezzo.title,
    entryId: grezzo.entryId,
    ...(testo(grezzo.name) ? { name: grezzo.name } : {}),
    ...(SALUTI.includes(grezzo.health as Health) ? { health: grezzo.health as Health } : {}),
    ...(pieno(grezzo.ricollega) ? { ricollega: grezzo.ricollega } : {}),
  };
}

/**
 * Un messaggio di un agente, com'è arrivato dal filo, rifatto nella forma
 * del protocollo. Un messaggio che non ce l'ha torna senza `message`, e
 * `scarti` dice cosa non andava; uno che ce l'ha a metà torna con quello
 * che si salva. Un tipo che non si conosce torna vuoto e senza scarti: è di
 * una versione più nuova, e non è un errore.
 */
export function leggiMessaggio(grezzo: unknown): Letto {
  const scarti: string[] = [];
  if (!oggetto(grezzo) || !testo(grezzo.type)) return { scarti: ['un messaggio senza tipo'] };

  switch (grezzo.type) {
    case 'ack': {
      if (!pieno(grezzo.reqId) || typeof grezzo.ok !== 'boolean') return { scarti: ['una risposta a un comando senza forma'] };
      return {
        message: {
          type: 'ack',
          reqId: grezzo.reqId,
          ok: grezzo.ok,
          ...(testo(grezzo.error) ? { error: grezzo.error } : {}),
          ...('data' in grezzo ? { data: grezzo.data } : {}),
        },
        scarti,
      };
    }
    case 'hello':
    case 'devices': {
      const devices = dispositivi(grezzo.devices, scarti);
      if (!devices) return { scarti: ['un inventario senza l’elenco dei dispositivi'] };
      if (grezzo.type === 'devices') return { message: { type: 'devices', devices }, scarti };
      if (!numero(grezzo.protocol)) return { scarti: ['una presentazione senza il numero del protocollo'] };
      return {
        message: {
          type: 'hello',
          protocol: grezzo.protocol,
          name: testo(grezzo.name) ? grezzo.name : '',
          version: testo(grezzo.version) ? grezzo.version : '',
          devices,
        },
        scarti,
      };
    }
    case 'state': {
      /*
       * Uno stato senza stato non si prende a metà: preso con uno stato
       * vuoto, avrebbe cancellato quello di prima, e il passaggio dopo non
       * avrebbe avuto un «prima» con cui confrontarsi.
       */
      const state = stato(grezzo.state);
      if (!pieno(grezzo.externalId) || typeof grezzo.online !== 'boolean' || !state) {
        const chi = pieno(grezzo.externalId) ? ` del dispositivo «${grezzo.externalId}»` : '';
        return { scarti: [`uno stato${chi} senza la forma del protocollo`] };
      }
      return {
        message: { type: 'state', externalId: grezzo.externalId, online: grezzo.online, state, at: testo(grezzo.at) ? grezzo.at : '' },
        scarti,
      };
    }
    case 'accounts': {
      if (!Array.isArray(grezzo.accounts)) return { scarti: ['un elenco di account che non è un elenco'] };
      const accounts: LinkedAccount[] = [];
      for (const uno of grezzo.accounts) {
        const letto = account(uno);
        if (letto) accounts.push(letto);
        else scarti.push('un account collegato senza forma');
      }
      return { message: { type: 'accounts', accounts }, scarti };
    }
    default:
      return { scarti };
  }
}
