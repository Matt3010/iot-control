import type { Device, DeviceTest, Op, SceneCondition } from './devices.svelte';
import { saysDay, saysDays } from './timing';
import type { Capability } from './types';
import { daNominare } from './azioni';
import { leggiValore } from './valori';
import { nonProvabile, numero, siMisura, statoDi } from '../../shared/regole.js';

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

/**
 * Se si chiede con un numero — «sopra 25» — o con una parola. La stessa
 * regola la usa il server, da `shared/regole.js`.
 */
export const numerica = siMisura;

const unitaDi = (capability: Capability): string | undefined =>
  capability.kind === 'range' || capability.kind === 'sensor' ? capability.unit : undefined;

/** Un numero come si legge in Italia, lo stesso che scrive il server. */
export { numero };

/**
 * La prova su quella capacità, senza il nome del dispositivo davanti.
 *
 * Un interruttore porta la sua etichetta solo quando da sola la parola non
 * basta, con la stessa regola delle azioni (`lib/azioni.ts`): su una TV «si
 * accende» e «Muto si accende» sono due prove diverse, su una lampadina
 * basta «si accende», col nome del dispositivo davanti.
 */
export function fraseProva(device: Device, capability: Capability, op: Op, value: string | number, modo: Modo): string {
  if (op !== 'is') {
    const soglia = numero(value, unitaDi(capability));
    if (modo === 'quando') return `${capability.label} ${op === 'above' ? 'sale sopra' : 'scende sotto'} ${soglia}`;
    return `${capability.label} ${op === 'above' ? 'sopra' : 'sotto'} ${soglia}`;
  }
  // a impulso si chiede solo che scatti, e «scatta» non si accorda col nome
  const di = daNominare(device, capability) ? `${capability.label} ` : '';
  if (capability.kind === 'switch' && capability.pulse) return `${di}scatta`;
  if (capability.kind === 'switch') {
    const acceso = String(value) === 'true';
    if (modo === 'quando') return `${di}${acceso ? 'si accende' : 'si spegne'}`;
    // la parola di stato fra virgolette, come la scritta di un selettore: non si accorda con l'etichetta
    return di ? `${di}«${leggiValore(capability, value)}»` : leggiValore(capability, value);
  }
  // una serratura si comanda con «Apri» e con lo stesso valore dice com'è
  // rimasta: in una prova si legge a parole di stato (`shared/regole.js`)
  const stato = statoDi(capability, value);
  if (stato) return stato[modo];
  // un evento non «diventa» niente: succede, e si dice che cosa
  if (capability.kind === 'sensor' && capability.event) return `${capability.label} «${leggiValore(capability, value)}»`;
  if (modo === 'quando') return `${capability.label} diventa «${leggiValore(capability, value)}»`;
  return `${capability.label} «${leggiValore(capability, value)}»`;
}

/** La prima lettera grande, per le voci da scegliere: «Si accende». */
const grande = (testo: string): string => testo.charAt(0).toLocaleUpperCase('it') + testo.slice(1);

/** La stessa frase per una prova già scritta, col nome del dispositivo davanti. */
export function fraseDiProva(devices: Device[], prova: DeviceTest, modo: Modo): string {
  const device = devices.find((one) => one.id === prova.deviceId);
  if (!device) return 'un dispositivo che non c’è più';
  const capability = (device.capabilities as Capability[]).find((one) => one.code === prova.code);
  if (!capability) return `${device.name}, una cosa che non sa più fare`;
  return `${device.name} · ${fraseProva(device, capability, prova.op, prova.value, modo)}`;
}

/**
 * Le cose di un dispositivo su cui si può scrivere una prova. Lo decide
 * `nonProvabile` in `shared/regole.js`, la stessa risposta che il server usa
 * per rifiutare quello che qui non si mostra.
 */
export const provabili = (device: Device, modo: Modo): Capability[] =>
  (device.capabilities as Capability[]).filter((capability) => !nonProvabile(capability, modo));

/**
 * Le prove che si possono scegliere su quel dispositivo.
 *
 * Per i valori di stato sono già complete. Per i numeri manca la soglia, che
 * si chiede dopo: l'id finisce con `>` o `<` e chi la sceglie sa che deve
 * chiederla.
 */
export function scelteDi(device: Device, modo: Modo): { id: string; label: string }[] {
  return provabili(device, modo).flatMap((capability) => {
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
    // di un elenco con le sue parole di stato si provano solo le voci che ne hanno
    const stati = capability.kind === 'enum' ? capability.detti : undefined;
    const valori =
      capability.kind === 'switch'
        ? capability.pulse
          ? ['true']
          : ['true', 'false']
        : capability.kind === 'enum'
          ? capability.values.filter((value) => !stati || value in stati)
          : capability.kind === 'sensor'
            ? (capability.values ?? [])
            : [];
    return valori.map((value) => ({
      id: `${capability.code}:=${value}`,
      label: grande(fraseProva(device, capability, 'is', value, modo)),
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
