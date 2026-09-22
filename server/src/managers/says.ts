import type { Capability, DeviceValue } from '../../../shared/protocol.js';

/**
 * Un comando detto come lo direbbe una persona: «Accendi», «Chiudi»,
 * «Luminosità 40%».
 *
 * Serve al registro, che si legge. `power=true` è come lo dice il protocollo,
 * e in una riga che racconta la tua sera non ci sta.
 */
export function says(capability: Capability, value: DeviceValue): string {
  if (capability.kind === 'switch') return value ? 'Accendi' : 'Spegni';
  if (capability.kind === 'enum') return String(value);
  if (capability.kind === 'range') return `${capability.label} ${value}${capability.unit ?? ''}`;
  return String(value);
}
