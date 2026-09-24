import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { Op } from '../types.js';

/**
 * Un comando detto come lo direbbe una persona: «accendi», «chiudi»,
 * «luminosità 40%».
 *
 * Serve al registro, che si legge. `power=true` è come lo dice il protocollo,
 * e in una riga che racconta la tua sera non ci sta.
 *
 * Resta il comando e non il risultato — «accendi», non «acceso» — per due
 * motivi: nel registro ci finisce anche quello che non è riuscito, e dire
 * «acceso» di una cosa che non si è accesa sarebbe falso; e un participio in
 * italiano ha un genere, mentre i dispositivi si chiamano come capita.
 */
export function says(capability: Capability, value: DeviceValue): string {
  if (capability.kind === 'switch') return capability.pulse ? 'premi' : value ? 'accendi' : 'spegni';
  if (capability.kind === 'enum') return String(value);
  // le parole di un sensore, come si leggono: «Aperta», «uno squillo»
  if (capability.kind === 'sensor' && capability.labels) return capability.labels[String(value)] ?? String(value);
  if (capability.kind === 'range')
    return `${capability.label.toLocaleLowerCase('it')} ${value}${capability.unit ?? ''}`;
  return String(value);
}

/** Un numero come si legge in Italia: la virgola, e l'unità dopo uno spazio. */
export function number(value: DeviceValue | string, unit?: string): string {
  const numero = Number(value);
  const scritto = Number.isFinite(numero) ? numero.toLocaleString('it', { maximumFractionDigits: 1 }) : String(value);
  return unit ? `${scritto} ${unit}` : scritto;
}

/**
 * Una soglia detta come la si direbbe: «sale sopra 25 °C», «scende sotto
 * 18 °C». Al presente e senza soggetto, così si appoggia a qualunque nome
 * senza doversi accordare: «Sonda cucina sale sopra 25 °C».
 */
export function saysThreshold(capability: Capability, op: Op, value: DeviceValue | string): string {
  const unit = capability.kind === 'range' || capability.kind === 'sensor' ? capability.unit : undefined;
  return `${op === 'above' ? 'sale sopra' : 'scende sotto'} ${number(value, unit)}`;
}
