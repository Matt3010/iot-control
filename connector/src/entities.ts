import { Ricordi } from './ricordi.js';
import type { Capability, DeviceSnapshot, DeviceValue } from '../../shared/protocol.js';
import { Forme } from './forme.js';
import type { HaEntity } from './homeassistant.js';
import { domainOf, ignota, nomeDellaClasse, ripulite } from './domini/comune.js';
import { DOMINI } from './domini/index.js';
import { impostaGradi as gradiDellaCasa, impostaTraduzioni as paroleDellaCasa } from './domini/lingua.js';
import type { Comando, Contesto, Dominio, Origine, Ruolo } from './domini/tipo.js';

/**
 * Da un'entità di Home Assistant a quello che il backend sa disegnare. È
 * l'unico punto del progetto dove esiste una parola di domotica: di qua in poi
 * sono interruttori, cursori e numeri.
 *
 * Quello che sa ogni dominio sta nel suo file (connector/src/domini/); qui
 * c'è lo smistamento — a quale dominio chiedere — e quello che l'agente
 * ricorda di ogni entità: la forma, gli ultimi valori, le preferenze.
 */

export { domainOf, ignota, numeric } from './domini/comune.js';
export { EVENTO_MS } from './domini/letture.js';
export { tradotto } from './domini/lingua.js';
export type { Comando, Origine, Ruolo, ServiceCall } from './domini/tipo.js';

/** Il dominio di un'entità, se è uno di quelli che conosciamo. Solo le voci della tabella, non quello che ogni oggetto si porta dietro. */
export const dominioDi = (entityId: string): Dominio | undefined => {
  const domain = domainOf(entityId);
  return Object.hasOwn(DOMINI, domain) ? DOMINI[domain] : undefined;
};
export const ruoloDi = (entityId: string): Ruolo | undefined => dominioDi(entityId)?.ruolo;

/**
 * Quello che si è già ricavato da un'entità com'è adesso: la forma e i
 * valori. Un'entità che non cambia si legge una volta sola, anche se la
 * chiedono in tanti — il giro d'inventario per raggruppare e poi per
 * comporre, e ogni cambiamento di un'altra entità dello stesso dispositivo.
 * La chiave è l'oggetto dell'entità: ogni cambiamento dalla centrale ne porta
 * uno nuovo, e quello vecchio se ne va da solo. `versione` cambia quando
 * cambia qualcosa che non sta nell'entità — le parole, i gradi, le
 * preferenze — e allora si rilegge tutto.
 */
interface Letta {
  versione: number;
  forma?: { origine: Origine | undefined; capabilities: Capability[] };
  stato?: Record<string, DeviceValue>;
}
const lette = new WeakMap<HaEntity, Letta>();
let versione = 0;
const letta = (entity: HaEntity): Letta => {
  const gia = lette.get(entity);
  if (gia?.versione === versione) return gia;
  const nuova: Letta = { versione };
  lette.set(entity, nuova);
  return nuova;
};
const stessaOrigine = (a: Origine | undefined, b: Origine | undefined): boolean =>
  a?.platform === b?.platform && a?.translationKey === b?.translationKey;

/** Le parole della centrale in italiano (domini/lingua.ts); se cambiano, ogni forma si rilegge. */
export const impostaTraduzioni = (tradotte: Record<string, string>): void => {
  if (paroleDellaCasa(tradotte)) versione += 1;
};
/** I gradi della casa (domini/lingua.ts); se cambiano, ogni forma si rilegge. */
export const impostaGradi = (unit: string | undefined): void => {
  if (gradiDellaCasa(unit)) versione += 1;
};

/** Il nome di una lettura secondo quello che misura: «Temperatura», «Porta», o il nome neutro del suo dominio. */
export const nomeMisura = (entity: HaEntity): string => nomeDellaClasse(entity) ?? dominioDi(entity.entity_id)?.nomeLettura ?? 'Valore';

/** Se si sa cosa misura: allora quella parola vale più di ogni altro nome. */
export const misuraNota = (entity: HaEntity): boolean => !!nomeDellaClasse(entity);

/**
 * L'ultimo valore conosciuto di ogni entità. Serve ai comandi che devono
 * ripetere quello che non cambiano quando lo stato di adesso non lo dice
 * più: l'altra soglia di un clima, il modo in cui riaccenderlo.
 */
const ricordi = new Map<string, Record<string, DeviceValue>>();

/**
 * Quando è arrivato all'agente lo stato di adesso di ogni entità che dice
 * eventi. Serve a sapere se un evento è appena successo senza confrontare
 * l'orologio della centrale con il nostro (domini/letture.ts).
 */
const arrivi = new Map<string, { stato: string; at: number }>();
export const arrivato = (entity: HaEntity): void => {
  if (dominioDi(entity.entity_id)?.evento) arrivi.set(entity.entity_id, { stato: entity.state, at: Date.now() });
};

/**
 * Come suonerà una sirena la prossima volta, e ogni altro valore che la cosa
 * non ricorda e che si dice quando la si comanda. Li tiene l'agente, in un
 * file suo, perché un tono scelto una volta non deve tornare quello di
 * fabbrica a ogni riavvio.
 */
let preferenze = new Map<string, Record<string, DeviceValue>>();
let filePreferenze = new Ricordi<Record<string, DeviceValue>>(undefined, 'preferenze', sonoValori);
function sonoValori(value: unknown): value is Record<string, DeviceValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export const usaPreferenze = (file: string): void => {
  filePreferenze = new Ricordi(file, 'preferenze', sonoValori);
  preferenze = filePreferenze.leggi();
  versione += 1;
};
export const ricordaPreferenza = (entityId: string, valori: Record<string, DeviceValue>): void => {
  preferenze.set(entityId, { ...preferenze.get(entityId), ...valori });
  filePreferenze.salvaSubito(() => preferenze);
  versione += 1;
};

const contesto = (entity: HaEntity, origine?: Origine, prima?: Capability[]): Contesto => {
  const arrivo = arrivi.get(entity.entity_id);
  return {
    entity,
    origine,
    prima,
    preferenze: preferenze.get(entity.entity_id) ?? {},
    arrivo: arrivo?.stato === entity.state ? arrivo.at : undefined,
  };
};

/**
 * Le capacità di un'entità, dalla sua forma: il dominio, i bit di quello che
 * sa fare, la classe, l'unità, gli elenchi che dichiara. Mai dal valore di
 * adesso, se no la forma cambierebbe con lo stato. Un dominio che non
 * conosciamo non ha capacità.
 */
export function capabilitiesOf(entity: HaEntity, origine?: Origine, prima?: Capability[]): Capability[] {
  return ripulite(dominioDi(entity.entity_id)?.capacita(contesto(entity, origine, prima)) ?? []);
}

/**
 * Un valore di un elenco che non è fra le sue voci non si manda: chi lo
 * riceve non saprebbe né disegnarlo né rimandarlo indietro. Vale per ogni
 * dominio, anche per quelli che se lo dimenticano.
 */
function soloVoci(state: Record<string, DeviceValue>, capabilities: Capability[]): Record<string, DeviceValue> {
  const out: Record<string, DeviceValue> = {};
  for (const [code, valore] of Object.entries(state)) {
    const capability = capabilities.find((one) => one.code === code);
    if (capability?.kind === 'enum' && !capability.values.includes(String(valore))) continue;
    out[code] = valore;
  }
  return out;
}

/**
 * Com'è adesso un'entità. Un dominio che non conosciamo non ha stato. Si
 * legge una volta per entità, tranne per chi dice eventi: la sua parola
 * dipende da quanto tempo è passato, non solo da com'è.
 */
export function stateOf(entity: HaEntity): Record<string, DeviceValue> {
  const dominio = dominioDi(entity.entity_id);
  if (!dominio) return {};
  const sua = letta(entity);
  if (sua.stato && !dominio.evento) return sua.stato;

  const grezzo = dominio.stato(contesto(entity));
  // il ricordo tiene tutto quello che si è letto, anche un valore che adesso non si manda
  const ricordo = ricordi.get(entity.entity_id);
  if (ricordo) Object.assign(ricordo, grezzo);
  else ricordi.set(entity.entity_id, { ...grezzo });

  sua.stato = soloVoci(grezzo, sua.forma?.capabilities ?? capabilitiesOf(entity));
  return sua.stato;
}

/**
 * Irraggiungibile è una cosa sola: `unavailable`, cioè Home Assistant non lo
 * sente. `unknown` è un'altra — il dispositivo c'è e risponde, ma non ha
 * ancora detto a che punto è. Una tapparella che nessuno ha mosso da quando
 * HA si è acceso sta così, e chiamarla irraggiungibile è una bugia: si può
 * comandare benissimo.
 */
export const isOnline = (entity: HaEntity): boolean => entity.state !== 'unavailable';

/**
 * La memoria delle forme (connector/src/forme.ts). Senza file finché
 * index.ts non gliene dà uno: le prove la usano così.
 */
let memoria = new Forme();
export const usaMemoria = (forme: Forme): void => {
  memoria = forme;
};
/** Dimentica forme, valori, arrivi e preferenze delle entità che l'anagrafe non conosce più. */
export const soloQueste = (conosciute: Set<string>): void => {
  memoria.soloQueste(conosciute);
  for (const id of ricordi.keys()) if (!conosciute.has(id)) ricordi.delete(id);
  for (const id of arrivi.keys()) if (!conosciute.has(id)) arrivi.delete(id);
  const prima = preferenze.size;
  for (const id of preferenze.keys()) if (!conosciute.has(id)) preferenze.delete(id);
  if (preferenze.size !== prima) filePreferenze.salva(() => preferenze);
};
/** Se di quell'entità si conosce una forma vista con uno stato. */
export const formaNota = (entityId: string): Capability[] | undefined => {
  const forma = memoria.get(entityId);
  return forma?.nota ? forma.capabilities : undefined;
};
/** Se l'ultima forma nota di un'entità ha un'immagine: allora è una telecamera, di qualunque dominio sia. */
export const haImmagine = (entityId: string): boolean =>
  !!memoria.get(entityId)?.capabilities.some((capability) => capability.kind === 'image');

/**
 * La forma di un'entità, e se è cambiata dall'ultima volta.
 *
 * Con lo stato conosciuto si ricava dagli attributi, e si ricorda. Con lo
 * stato che non si sa vale quella ricordata: gli attributi che dipendono
 * dallo stato sono spariti, e una forma rifatta da quello che resta sarebbe
 * un'altra. Senza un ricordo si fa quello che si può, e non si ricorda come
 * vera.
 */
export function formaDi(entity: HaEntity, origine?: Origine): { capabilities: Capability[]; cambiata: boolean } {
  const sua = letta(entity);
  if (sua.forma && stessaOrigine(sua.forma.origine, origine)) return { capabilities: sua.forma.capabilities, cambiata: false };

  const id = entity.entity_id;
  const prima = memoria.get(id);
  let fatta: { capabilities: Capability[]; cambiata: boolean };
  // una forma ricordata da un agente di prima può avere ancora i doppioni che adesso si tolgono
  if (ignota(entity.state) && prima) fatta = { capabilities: ripulite(prima.capabilities), cambiata: false };
  else if (ignota(entity.state)) {
    const provvisoria = capabilitiesOf(entity, origine);
    fatta = { capabilities: provvisoria, cambiata: memoria.tieni(id, provvisoria, false) };
  } else {
    const capabilities = capabilitiesOf(entity, origine, prima?.nota ? prima.capabilities : undefined);
    fatta = { capabilities, cambiata: memoria.tieni(id, capabilities, true) };
  }
  sua.forma = { origine, capabilities: fatta.capabilities };
  return fatta;
}

export function translate(entity: HaEntity | undefined, origine?: Origine): DeviceSnapshot | null {
  if (!entity || !ruoloDi(entity.entity_id)) return null;

  const { capabilities } = formaDi(entity, origine);
  if (!capabilities.length) return null;

  return {
    externalId: entity.entity_id,
    name: (entity.attributes.friendly_name as string | undefined) ?? entity.entity_id,
    online: isOnline(entity),
    capabilities,
    state: stateOf(entity),
  };
}

/**
 * Un comando che scende diventa quello che dice il dominio dell'entità per
 * quel codice. Un codice che il dominio non ha è una cosa che non sa fare.
 *
 * `entity` è com'è adesso l'entità, per i comandi che devono ripetere quello
 * che non cambiano: la saturazione di un colore quando si sceglie la tinta,
 * l'altra soglia di un clima a due soglie.
 */
export function toServiceCall(entityId: string, code: string, value: DeviceValue, entity?: HaEntity): Comando {
  // una capacità di un'altra entità dello stesso dispositivo: il comando va a
  // lei, e si traduce per quello che è lei (connector/src/gruppi.ts)
  const cancelletto = code.indexOf('#');
  if (cancelletto >= 0) {
    const altra = code.slice(0, cancelletto);
    const interno = code.slice(cancelletto + 1);
    return altra && interno && !interno.includes('#') ? toServiceCall(altra, interno, value, entity) : null;
  }

  const comandi = dominioDi(entityId)?.comandi;
  const comando = comandi && Object.hasOwn(comandi, code) ? comandi[code] : undefined;
  if (!comando) return null;
  return comando(
    { entityId, entity, ricordo: ricordi.get(entityId) ?? {}, preferenze: preferenze.get(entityId) ?? {} },
    value,
  );
}

/** A quale entità va un comando con `#`: quella prima del cancelletto. */
export const targetOf = (externalId: string, code: string): string => (code.includes('#') ? (code.split('#')[0] as string) : externalId);
