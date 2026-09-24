import type { Capability, DeviceValue } from './types';

/**
 * Come si legge il valore di una capacità: «acceso», «Automatico» per
 * `heat_cool`, «in carica» per `charging`, 21,4 invece di 21.4371.
 *
 * Lo stesso valore si leggeva in tre modi in tre posti — la pastiglia di
 * un'azione, la frase di una prova, la lettura di un sensore — e ognuno
 * sapeva una cosa che gli altri non sapevano: le etichette uno, gli
 * interruttori un altro, i decimali il terzo. Qui le sanno tutte e tre.
 */
export function leggiValore(capability: Capability | undefined, value: DeviceValue | string | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  // un interruttore acceso è «acceso», anche quando il valore arriva scritto
  if (capability?.kind === 'switch') return String(value) === 'true' ? 'acceso' : 'spento';
  if (capability && (capability.kind === 'enum' || capability.kind === 'sensor')) {
    const detta = capability.labels?.[String(value)];
    if (detta) return detta;
  }
  if (typeof value === 'number') return `${Math.round(value * 10) / 10}`;
  if (typeof value === 'boolean') return value ? 'sì' : 'no';
  return String(value);
}
