import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { HaEntity } from '../homeassistant.js';
import { gradi, tradotto, VOCI } from './lingua.js';
import type { Contesto, ContestoComando, Origine, ServiceCall } from './tipo.js';

/**
 * I pezzi che servono a più di un dominio. Stanno qui perché prima ogni
 * dominio se li riscriveva: la classe di un'entità si ricavava in tre posti,
 * i cursori dell'umidità e della temperatura in due, e le voci di un elenco
 * di ordini erano scritte una volta per le capacità e un'altra per i comandi.
 */

export const domainOf = (entityId: string): string => entityId.split('.')[0] ?? '';

/**
 * Una lettura che non si conosce. `unavailable` è la centrale che non sente
 * il dispositivo, `unknown` il dispositivo che non ha ancora detto a che
 * punto è: in tutti e due i casi non c'è un valore, e mandarne uno inventato
 * — «spento», «Apri» — farebbe scattare una scena per una cosa mai successa.
 * Il codice si lascia fuori dallo stato, e chi guarda vede che non si sa.
 */
export const ignota = (state: string | undefined): boolean => state === undefined || state === 'unavailable' || state === 'unknown';

/** Un numero da un attributo, con il suo ripiego. */
export const attr = (entity: HaEntity, nome: string, ripiego: number): number => {
  const valore = Number(entity.attributes[nome]);
  return entity.attributes[nome] !== undefined && entity.attributes[nome] !== null && Number.isFinite(valore) ? valore : ripiego;
};

/** Un elenco di parole da un attributo, o niente. */
export const elenco = (entity: HaEntity, nome: string): string[] | undefined => {
  const valore = entity.attributes[nome];
  return Array.isArray(valore) && valore.length ? valore.map(String) : undefined;
};

/** Una parola da un attributo, solo se è fra quelle ammesse: il resto non si sa. */
export const fra = (valore: unknown, ammessi: string[] | undefined): string | undefined =>
  typeof valore === 'string' && ammessi?.includes(valore) ? valore : undefined;

/** Se la cosa dice di saper fare quello che dice il bit. Senza l'entità non si sa, e quindi no. */
export const has = (entity: HaEntity | undefined, bit: number): boolean =>
  !!entity && (Number(entity.attributes.supported_features ?? 0) & bit) === bit;

export const percent = (label: string, code: string): Capability => ({ code, kind: 'range', label, min: 0, max: 100, step: 1, unit: '%' });

/** Un numero resta un numero; quello che non lo è non è un numero, e una stringa vuota nemmeno. */
export const numeric = (value: unknown): DeviceValue | undefined => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Acceso, spento, o non si sa: la terza non è «spento». */
export const accesoSe = (state: string): boolean | undefined => (state === 'on' ? true : state === 'off' ? false : undefined);

/** Mette un valore nello stato solo se c'è: un codice senza valore si lascia fuori. */
export const metti = (state: Record<string, DeviceValue>, code: string, value: DeviceValue | undefined): void => {
  if (value !== undefined) state[code] = value;
};

/** La levetta di tutto quello che si accende. */
export const acceso: Capability = { code: 'power', kind: 'switch', label: 'Acceso' };

/** Accendere o spegnere: `homeassistant.turn_on` vale per ogni dominio, quindi è una riga sola per tutti. */
export const accendi = (_ctx: ContestoComando, valore: DeviceValue): ServiceCall => ({
  domain: 'homeassistant',
  service: valore ? 'turn_on' : 'turn_off',
  data: {},
});

/** Un comando che chiama un servizio con un solo dato. */
export const servizio =
  (domain: string, service: string, dato?: (valore: DeviceValue) => Record<string, unknown>) =>
  (_ctx: ContestoComando, valore: DeviceValue): ServiceCall => ({ domain, service, data: dato ? dato(valore) : {} });

/** Che tipo di cosa è un'entità secondo la centrale: una porta, una tapparella, una temperatura. */
export const classe = (entity: HaEntity): string => (entity.attributes.device_class ? String(entity.attributes.device_class) : '');

/** Il nome che la centrale dà a quello che un'entità misura, se lo sa. */
export const nomeDellaClasse = (entity: HaEntity): string | undefined => {
  const sua = classe(entity);
  return sua ? tradotto(`component.${domainOf(entity.entity_id)}.entity_component.${sua}.name`) : undefined;
};

/** Il nome di una lettura secondo quello che misura, o un nome neutro se non si sa. */
export const nomeMisura = (entity: HaEntity, neutro = 'Valore'): string => nomeDellaClasse(entity) ?? neutro;

/**
 * Come si leggono le voci di un elenco. Il valore resta quello del
 * dispositivo, che è quello che si manda indietro e che le condizioni
 * ricordano; cambia solo come si legge.
 *
 * Prima la parola dell'integrazione per quell'entità, poi quella che la
 * centrale ha per quel tipo di cosa, poi quella per tutto il dominio, e per
 * ultimo il nostro dizionario. `attributo` è l'attributo da cui vengono le
 * voci, o niente se sono lo stato stesso.
 */
export function vociDi(
  entity: HaEntity,
  origine: Origine | undefined,
  valori: string[],
  attributo?: string,
  dizionario: Record<string, string> = VOCI,
): Record<string, string> | undefined {
  const domain = domainOf(entity.entity_id);
  const sua = classe(entity);
  const dette: Record<string, string> = {};
  for (const valore of valori) {
    const coda = attributo ? `state_attributes.${attributo}.state.${valore}` : `state.${valore}`;
    const detta =
      tradotto(origine?.translationKey ? `component.${origine.platform}.entity.${domain}.${origine.translationKey}.${coda}` : undefined) ??
      tradotto(sua ? `component.${domain}.entity_component.${sua}.${coda}` : undefined) ??
      tradotto(`component.${domain}.entity_component._.${coda}`) ??
      dizionario[valore.trim().toLowerCase()];
    if (detta) dette[valore] = detta;
  }
  return Object.keys(dette).length ? dette : undefined;
}

/** Un elenco di voci da scegliere, con le voci dette in italiano quando si sa. */
export const scelta = (ctx: Contesto, code: string, label: string, values: string[], attributo?: string): Capability => {
  const labels = vociDi(ctx.entity, ctx.origine, values, attributo);
  return { code, kind: 'enum', label, values, ...(labels ? { labels } : {}) };
};

/**
 * Una lettura a parole, con le parole dette in italiano quando si sa. Senza
 * altro è come sta adesso una cosa che ha più stati di «acceso» e «spento».
 */
export const adesso = (ctx: Contesto, values: string[], code = 'status', label = 'Adesso'): Capability => {
  const labels = vociDi(ctx.entity, ctx.origine, values);
  return { code, kind: 'sensor', label, values, ...(labels ? { labels } : {}) };
};

/** Un cursore di temperatura, con i limiti che dice la cosa o i suoi ripieghi. */
export const cursoreTemperatura = (
  entity: HaEntity,
  code: string,
  label: string,
  ripiego: { min: number; max: number; step: number },
): Capability => ({
  code,
  kind: 'range',
  label,
  min: attr(entity, 'min_temp', ripiego.min),
  max: attr(entity, 'max_temp', ripiego.max),
  step: attr(entity, 'target_temp_step', ripiego.step),
  unit: gradi,
});

/** Il cursore dell'umidità che si vuole, con i limiti che dice la cosa o i suoi ripieghi. */
export const cursoreUmidita = (entity: HaEntity, ripiego: { min: number; max: number }): Capability => ({
  code: 'humidity',
  kind: 'range',
  label: 'Umidità',
  min: attr(entity, 'min_humidity', ripiego.min),
  max: attr(entity, 'max_humidity', ripiego.max),
  step: 1,
  unit: '%',
});

/**
 * Una voce di un elenco di ordini: la parola che si legge, il servizio che la
 * fa, il bit con cui la cosa dice di saperlo fare (niente: lo sa sempre), e
 * lo stato della cosa che quella voce descrive, se ce n'è uno.
 */
export interface Ordine {
  voce: string;
  servizio: string;
  bit?: number;
  stato?: string;
  /** Come si legge la voce in una prova, quando è un verbo: «Apri» di una serratura è «è aperta». */
  detto?: { se: string; quando: string };
}

/**
 * Un elenco di ordini — i tasti di una TV, apri e chiudi, avvia e torna alla
 * base — scritto una volta sola. Ne escono insieme le voci che quella cosa
 * sa fare, il servizio per ogni voce e la voce che corrisponde allo stato di
 * adesso. Il servizio si trova per ogni voce della tabella, anche senza
 * l'entità: un comando si traduce anche quando lo stato non si sa.
 */
export function ordini<T extends Ordine>(
  entity: HaEntity | undefined,
  tabella: T[],
  vale: (ordine: T) => boolean = (ordine) => !ordine.bit || has(entity, ordine.bit),
): {
  voci: string[];
  detti: Record<string, { se: string; quando: string }> | undefined;
  servizio: (voce: DeviceValue) => string | undefined;
  voceDi: (stato: string) => string | undefined;
} {
  const scelti = tabella.filter(vale);
  const conDetto = scelti.filter((ordine) => ordine.detto);
  return {
    voci: scelti.map((ordine) => ordine.voce),
    detti: conDetto.length ? Object.fromEntries(conDetto.map((ordine) => [ordine.voce, ordine.detto!])) : undefined,
    servizio: (voce) => tabella.find((ordine) => ordine.voce === String(voce))?.servizio,
    voceDi: (stato) => scelti.find((ordine) => ordine.stato === stato)?.voce,
  };
}

/** Il comando di un elenco di ordini: la voce scelta diventa il suo servizio, o niente. */
export const ordina =
  (domain: string, tabella: Ordine[]) =>
  (ctx: ContestoComando, valore: DeviceValue): ServiceCall | null => {
    const service = ordini(ctx.entity, tabella).servizio(valore);
    return service ? { domain, service, data: {} } : null;
  };

/** Un elenco di ordini come capacità: un tasto per voce, o niente se non ne sa fare nessuno. */
export const tasti = (code: string, label: string, voci: string[]): Capability[] =>
  voci.length ? [{ code, kind: 'enum', label, values: voci, order: true }] : [];
