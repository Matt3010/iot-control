import type { Capability, DeviceValue } from '../../../shared/protocol.js';

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
  if (capability.kind === 'switch') return value ? 'accendi' : 'spegni';
  if (capability.kind === 'enum') return String(value);
  if (capability.kind === 'range')
    return `${capability.label.toLocaleLowerCase('it')} ${value}${capability.unit ?? ''}`;
  return String(value);
}
