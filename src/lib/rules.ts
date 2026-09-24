import type { Device, Op, Rule } from './devices.svelte';
import { fraseProva, scelteDi } from './prove';
import type { Capability } from './types';
import type { Choice } from './table';

/**
 * Come si legge un avviso scritto su una cosa.
 *
 * Sta qui e non dentro a una schermata perché la stessa frase serve in due
 * posti — l'elenco di quelli già scritti e la scelta di quelli che si possono
 * scrivere — e due copie della stessa frase divergono alla prima correzione
 * fatta su una sola.
 */

/** Il silenzio non è una capacità del dispositivo: è l'assenza di tutte. */
export const SILENZIO = 'silenzio';

export const TACE = 'Se smette di rispondere';

/**
 * La frase di un avviso già scritto: le stesse parole di quando lo si
 * sceglie, e di quando fa partire una scena (lib/prove.ts).
 */
export function fraseDi(device: Device, code: string, becomes: string, op: Op = 'is'): string | undefined {
  const capability = (device.capabilities as Capability[]).find((one) => one.code === code);
  return capability ? fraseProva(capability, op, becomes, 'quando') : undefined;
}

/**
 * Cosa si può ancora chiedere di questa cosa.
 *
 * Il silenzio per primo, perché vale per qualunque dispositivo — anche una
 * telecamera, che di interruttori non ne ha. Quelli già scritti non si
 * ripropongono: offrire due volte la stessa cosa è rumore.
 */
export function restaDa(device: Device, rules: Rule[]): Choice[] {
  const scritte = rules.filter((rule) => rule.deviceId === device.id && (rule.op ?? 'is') === 'is');
  return [
    ...(device.watch ? [] : [{ id: SILENZIO, label: TACE }]),
    // le soglie si ripropongono sempre: «sopra 25» e «sopra 30» sono due avvisi
    ...scelteDi(device, 'quando').filter(
      (one) => !scritte.some((rule) => `${rule.code}:=${rule.becomes}` === one.id),
    ),
  ];
}
