import { nomeColore } from './colori';
import { leggiValore } from './valori';
import type { Device } from './devices.svelte';
import type { Capability, DeviceValue } from './types';

/**
 * Il nome di un'azione dice di quale capacità si parla quando da sola non
 * basta.
 *
 * Esiste perché la stessa scelta — nominarla o no — la facevano in quattro
 * posti, ognuno a modo suo: l'editor delle scene, la riga salvata, le prove
 * e la domanda prima di un comando. Uno nominava l'interruttore se erano
 * due, uno solo se era un'impostazione, uno mai, e ne uscivano pastiglie
 * uguali («Automatico» per il modo e per la ventola), righe ripetute
 * («Accendi» due volte su una TV) e domande come «Sì «Clima»?».
 *
 * La regola è una. Si nomina quando la capacità è un'impostazione, quando il
 * dispositivo ne ha più d'una dello stesso tipo (una TV con l'accensione e
 * il muto, un clima con modo e ventola), o quando il valore da solo non dice
 * cosa cambia: «Sì», «No», un numero.
 */

/** Il tipo che conta per dire «ce n'è più d'uno»: un tasto a impulso non è una levetta. */
const tipo = (capability: Capability): string =>
  capability.kind === 'switch' && capability.pulse ? 'impulso' : capability.kind;

/** Le parole che dicono com'è una cosa senza dire quale. */
const MUTE = new Set(['sì', 'si', 'no', 'on', 'off', 'true', 'false', 'yes', 'acceso', 'spento']);

/** Se quella parola, letta da sola, lascia indovinare di cosa si parla. */
function muta(parola: string): boolean {
  const detta = parola.trim().toLocaleLowerCase('it');
  if (MUTE.has(detta)) return true;
  return detta !== '' && Number.isFinite(Number(detta.replace(',', '.')));
}

/** La voce di un elenco come si legge: `heat_cool` → «Automatico». La regola è in `valori.ts`. */
const voce = leggiValore;

/** Se un'azione su quella capacità deve dire di quale si tratta. */
export function daNominare(device: Device, capability: Capability): boolean {
  if (capability.setting) return true;
  const stessoTipo = (device.capabilities as Capability[]).filter(
    (one) => !one.setting && tipo(one) === tipo(capability),
  ).length;
  if (stessoTipo > 1) return true;
  if (capability.kind === 'enum') return capability.values.some((value) => muta(voce(capability, value)));
  return false;
}

/**
 * Un'azione detta a parole, senza il dispositivo davanti: «Accendi»,
 * «Accendi Muto», «Modo Automatico», «Lamelle Apri», «Colore blu».
 *
 * È la stessa per la pastiglia da scegliere e per la riga già salvata, così
 * quello che si è scelto si rilegge uguale.
 */
export function nomeAzione(device: Device, capability: Capability, value: DeviceValue | undefined): string {
  const di = daNominare(device, capability) ? ` ${capability.label}` : '';
  if (capability.kind === 'switch' && capability.pulse) {
    // una riga scritta prima di sapere che è a impulso: spegnere non arriva a niente
    return value ? `Premi${di}` : `Spegni${di}, che a impulso non fa niente`;
  }
  if (capability.kind === 'switch') return `${value ? 'Accendi' : 'Spegni'}${di}`;
  if (capability.kind === 'enum') return di ? `${capability.label} ${voce(capability, value)}` : voce(capability, value);
  // un colore si dice per nome: «imposta a 230» non lo legge nessuno
  if (capability.kind === 'color') return `Colore ${nomeColore(Number(value)).toLocaleLowerCase('it')}`;
  // un numero da solo non dice mai cosa cambia
  if (capability.kind === 'range') return `${capability.label} ${String(value)}${capability.unit ?? ''}`;
  return String(value);
}

/**
 * La domanda prima di un comando dato da qui: «Accendere «TV»?»,
 * «Accendere «Muto» di «TV»?», «Impostare «Modo» di «Clima» a «Automatico»?».
 * Quando la capacità va nominata la domanda la nomina, e il valore resta
 * fra virgolette dove non è un verbo.
 */
export function domandaAzione(device: Device, capability: Capability, value: DeviceValue): string {
  const nominata = daNominare(device, capability);
  const chi = nominata ? `«${capability.label}» di «${device.name}»` : `«${device.name}»`;
  if (capability.kind === 'switch' && capability.pulse) return `Premere ${chi}?`;
  if (capability.kind === 'switch') return `${value ? 'Accendere' : 'Spegnere'} ${chi}?`;
  if (nominata) return `Impostare ${chi} a «${voce(capability, value)}»?`;
  return `${voce(capability, value)} ${chi}?`;
}
