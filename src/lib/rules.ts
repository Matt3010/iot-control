import type { Device, Rule } from './devices.svelte';
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
 * Le parole sono quelle che dice il dispositivo, e il valore sta fra
 * virgolette perché «diventa apri» non è italiano e non lo diventa smontando
 * la parola: quei valori li sceglie lui, e sono stati dove una porta dice
 * aperta e comandi dove una tenda dice apri.
 */
export function frase(capability: Capability, value: string): string {
  if (capability.kind === 'switch')
    return value === 'true' ? `${capability.label} si accende` : `${capability.label} si spegne`;
  return `${capability.label} diventa «${value}»`;
}

/** La stessa frase partendo da un avviso già scritto. */
export function fraseDi(device: Device, code: string, becomes: string): string | undefined {
  const capability = (device.capabilities as Capability[]).find((one) => one.code === code);
  return capability ? frase(capability, becomes) : undefined;
}

/**
 * I valori su cui si può scrivere un avviso.
 *
 * Solo quelli che un dispositivo assume davvero: un interruttore ha acceso e
 * spento, una tenda ha le sue tre posizioni. Su un numero — la luminosità, i
 * gradi — non si offre niente per ora: «sopra» e «sotto» sono un'altra cosa
 * da quella che c'è qui, e mezza cosa non si mette.
 */
function valoriDi(device: Device): Choice[] {
  return (device.capabilities as Capability[]).flatMap((capability) => {
    if (capability.kind === 'switch')
      return ['true', 'false'].map((value) => ({
        id: `${capability.code}:${value}`,
        label: frase(capability, value),
      }));
    if (capability.kind === 'enum')
      return capability.values.map((value) => ({
        id: `${capability.code}:${value}`,
        label: frase(capability, String(value)),
      }));
    return [];
  });
}

/**
 * Cosa si può ancora chiedere di questa cosa.
 *
 * Il silenzio per primo, perché vale per qualunque dispositivo — anche una
 * telecamera, che di interruttori non ne ha. Quelli già scritti non si
 * ripropongono: offrire due volte la stessa cosa è rumore.
 */
export function restaDa(device: Device, rules: Rule[]): Choice[] {
  const scritte = rules.filter((rule) => rule.deviceId === device.id);
  return [
    ...(device.watch ? [] : [{ id: SILENZIO, label: TACE }]),
    ...valoriDi(device).filter(
      (one) => !scritte.some((rule) => `${rule.code}:${rule.becomes}` === one.id),
    ),
  ];
}
