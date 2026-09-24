import type { Device, DeviceTest, Op, SceneCondition } from './devices.svelte';
import { saysDay, saysDays } from './timing';
import type { Capability } from './types';

/**
 * Le prove sui dispositivi dette a parole, per scene e avvisi.
 *
 * Il server ha il suo motore (`rules/prove.ts`) che decide se una prova
 * vale; qui c'è come la si legge e cosa si può scegliere. Una frase sola per
 * «quando la temperatura sale sopra 25» nella scheda di una scena e
 * nell'elenco degli avvisi: due copie divergerebbero alla prima correzione.
 *
 * Nessun participio che si accordi con un nome scelto da chi usa l'app: lo
 * stato di un interruttore è la parola da sola, «acceso», come la
 * scritta su un selettore, e non «è accesa», che per metà dei nomi avrebbe
 * il genere sbagliato.
 */

/** Quando: una cosa che succede. Se: una cosa che è vera. */
export type Modo = 'quando' | 'se';

export const numerica = (capability: Capability): boolean =>
  capability.kind === 'range' || capability.kind === 'sensor';

const unitaDi = (capability: Capability): string | undefined =>
  capability.kind === 'range' || capability.kind === 'sensor' ? capability.unit : undefined;

/** Un numero come si legge in Italia: la virgola, e l'unità dopo uno spazio. */
export function numero(value: string | number, unit?: string): string {
  const n = Number(value);
  const scritto = Number.isFinite(n) ? n.toLocaleString('it', { maximumFractionDigits: 1 }) : String(value);
  return unit ? `${scritto} ${unit}` : scritto;
}

/** Come si legge un valore di stato: «acceso», o quello che dice il dispositivo. */
const valore = (capability: Capability, value: string | number): string =>
  capability.kind === 'switch' ? (String(value) === 'true' ? 'acceso' : 'spento') : String(value);

/**
 * Le cose che si comandano con un ordine e si leggono con uno stato.
 *
 * Una serratura si comanda con «Apri» e «Chiudi a chiave», e lo stesso
 * valore dice com'è rimasta. In un «solo se» l'ordine si leggeva come
 * un'azione, quindi per le prove si scrive a parole di stato. Il valore
 * resta quello del dispositivo, perché è quello che arriva.
 */
const STATI: Record<string, Record<string, { se: string; quando: string }>> = {
  lock: {
    Apri: { se: 'aperto', quando: 'si apre' },
    'Chiudi a chiave': { se: 'chiuso a chiave', quando: 'si chiude a chiave' },
  },
};

/**
 * La prova su quella capacità, senza il nome del dispositivo davanti.
 *
 * Un interruttore non porta la sua etichetta: la chiama il dispositivo, e
 * spesso si chiama proprio «Acceso», che dava «Acceso su «acceso»». Per lui
 * basta la parola, «si accende» o «acceso», col nome del dispositivo
 * davanti quando serve.
 */
export function fraseProva(capability: Capability, op: Op, value: string | number, modo: Modo): string {
  if (op !== 'is') {
    const soglia = numero(value, unitaDi(capability));
    if (modo === 'quando') return `${capability.label} ${op === 'above' ? 'sale sopra' : 'scende sotto'} ${soglia}`;
    return `${capability.label} ${op === 'above' ? 'sopra' : 'sotto'} ${soglia}`;
  }
  if (capability.kind === 'switch') {
    const acceso = String(value) === 'true';
    if (modo === 'quando') return acceso ? 'si accende' : 'si spegne';
    return valore(capability, value);
  }
  const stato = STATI[capability.code]?.[String(value)];
  if (stato) return stato[modo];
  if (modo === 'quando') return `${capability.label} diventa «${value}»`;
  return `${capability.label} «${valore(capability, value)}»`;
}

/** La prima lettera grande, per le voci da scegliere: «Si accende». */
const grande = (testo: string): string => testo.charAt(0).toLocaleUpperCase('it') + testo.slice(1);

/** La stessa frase per una prova già scritta, col nome del dispositivo davanti. */
export function fraseDiProva(devices: Device[], prova: DeviceTest, modo: Modo): string {
  const device = devices.find((one) => one.id === prova.deviceId);
  if (!device) return 'un dispositivo che non c’è più';
  const capability = (device.capabilities as Capability[]).find((one) => one.code === prova.code);
  if (!capability) return `${device.name}, una cosa che non sa più fare`;
  return `${device.name} · ${fraseProva(capability, prova.op, prova.value, modo)}`;
}

/**
 * Quello che si comanda e basta, senza sapere com'è rimasto. Il movimento
 * di una tenda è l'ultimo ordine dato da qui, e se la si apre dal pulsante
 * a muro nessuno lo racconta. Il server lo rifiuta per la stessa ragione
 * (server/src/managers/check.ts).
 */
const SOLO_ORDINI = new Set(['move']);

/** Le cose di un dispositivo su cui si può scrivere una prova. */
export const provabili = (device: Device): Capability[] =>
  (device.capabilities as Capability[]).filter(
    (capability) => capability.kind !== 'image' && !SOLO_ORDINI.has(capability.code),
  );

/**
 * Le prove che si possono scegliere su quel dispositivo.
 *
 * Per i valori di stato sono già complete. Per i numeri manca la soglia, che
 * si chiede dopo: l'id finisce con `>` o `<` e chi la sceglie sa che deve
 * chiederla.
 */
export function scelteDi(device: Device, modo: Modo): { id: string; label: string }[] {
  return provabili(device).flatMap((capability) => {
    if (numerica(capability)) {
      return modo === 'quando'
        ? [
            { id: `${capability.code}:>`, label: `${capability.label} sale sopra…` },
            { id: `${capability.code}:<`, label: `${capability.label} scende sotto…` },
          ]
        : [
            { id: `${capability.code}:>`, label: `${capability.label} sopra…` },
            { id: `${capability.code}:<`, label: `${capability.label} sotto…` },
          ];
    }
    const stati = STATI[capability.code];
    const valori =
      capability.kind === 'switch'
        ? ['true', 'false']
        : capability.kind === 'enum'
          ? capability.values.filter((value) => !stati || value in stati)
          : [];
    return valori.map((value) => ({
      id: `${capability.code}:=${value}`,
      label: grande(fraseProva(capability, 'is', value, modo)),
    }));
  });
}

/** Da una scelta a una prova. `soglia` serve solo alle scelte numeriche. */
export function provaDa(device: Device, scelta: string, soglia?: number): DeviceTest | undefined {
  const [code, resto] = scelta.split(/:(.*)/s) as [string, string];
  if (resto === '>' || resto === '<') {
    if (soglia === undefined || !Number.isFinite(soglia)) return undefined;
    return { deviceId: device.id, code, op: resto === '>' ? 'above' : 'below', value: soglia };
  }
  return { deviceId: device.id, code, op: 'is', value: resto.slice(1) };
}

/** Se quella scelta ha bisogno di un numero. */
export const vuoleSoglia = (scelta: string): boolean => scelta.endsWith(':>') || scelta.endsWith(':<');

/** L'unità di quella scelta, per il campo che chiede la soglia. */
export function unitaDiScelta(device: Device, scelta: string): string | undefined {
  const code = scelta.split(':')[0];
  const capability = (device.capabilities as Capability[]).find((one) => one.code === code);
  return capability ? unitaDi(capability) : undefined;
}

/**
 * Una condizione a parole. Un gruppo dentro un altro va fra parentesi, se
 * no «A e B o C» non dice quale delle due letture è quella giusta.
 */
export function fraseCondizione(devices: Device[], condizione: SceneCondition, dentro = false): string {
  switch (condizione.kind) {
    case 'group': {
      // un gruppo appena aperto e ancora vuoto non dice niente, e non lascia un «e» a vuoto
      const parti = condizione.items.map((one) => fraseCondizione(devices, one, true)).filter(Boolean);
      const testo = parti.join(condizione.match === 'any' ? ' o ' : ' e ');
      return dentro && parti.length > 1 ? `(${testo})` : testo;
    }
    case 'device':
      return fraseDiProva(devices, condizione, 'se');
    case 'days':
      return saysDays(condizione.days);
    case 'hours':
      return `fra le ${condizione.from} e le ${condizione.to}`;
    case 'dates':
      return `da ${saysDay(condizione.from)} a ${saysDay(condizione.to)}`;
  }
}
