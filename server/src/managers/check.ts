import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { badRequest } from '../errors/HttpError.js';

/**
 * Questo valore, a questa cosa, si può dire?
 *
 * Stava dentro alle scene, e il comando singolo faceva da sé un controllo
 * più largo: gli bastava che fosse testo, numero o sì/no. Così una tenda che
 * sa «Apri», «Ferma» e «Chiudi» si lasciava dire «Vola», una luce accesa
 * con una parola invece che con un sì, e un cursore da zero a cento portare
 * a mille — e nel registro di casa finiva scritto che era andata bene.
 *
 * Due controlli sulla stessa cosa sono due controlli che prima o poi dicono
 * cose diverse: adesso è uno, e lo passano tutti e due.
 */
export function check(capability: Capability, value: DeviceValue): void {
  if (capability.kind === 'sensor') throw badRequest('un sensore si legge, non si comanda');
  if (capability.kind === 'image') throw badRequest('una telecamera si guarda, non si comanda');

  if (capability.kind === 'switch') {
    if (typeof value !== 'boolean') throw badRequest(`«${capability.label}» si accende o si spegne`);
    // a impulso si spegne da solo: «spegni» non arriverebbe a niente
    if (capability.pulse && !value) throw badRequest('è a impulso, si preme e si spegne da solo');
    return;
  }

  if (capability.kind === 'enum') {
    if (typeof value !== 'string' || !capability.values.includes(value)) {
      throw badRequest(`«${capability.label}» non sa fare «${String(value)}»`);
    }
    return;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw badRequest(`«${capability.label}» vuole un numero`);
  }
  if (value < capability.min || value > capability.max) {
    throw badRequest(`«${capability.label}» sta fra ${capability.min} e ${capability.max}`);
  }
}

/**
 * Questa cosa dice com'è davvero, o solo cosa le è stato ordinato?
 *
 * Il movimento di una tenda è un ordine. Il valore che torna è l'ultimo
 * dato da qui, e se la tenda si apre dal pulsante a muro nessuno lo viene
 * a sapere, perché i motori non lo raccontano. Una condizione o un avviso
 * scritti su quello direbbero «chiuso» a finestre aperte. Una tenda che
 * riporta la posizione ha «Apertura», che è un dato vero, e si chiede
 * quella.
 */
export const SOLO_ORDINI = new Set(['move']);

export function provabile(
  capability: Capability,
  deviceName: string,
  /** `quando` è una cosa che succede, `se` una cosa che è vera adesso. */
  modo: 'quando' | 'se',
  value?: unknown,
): void {
  /*
   * A impulso torna spento dopo mezzo secondo, e com'è rimasto quello che
   * comanda non si sa: non si chiede in un «solo se». Che scatti invece si
   * vede, perché l'impulso comincia con un'accensione, ed è l'unica cosa
   * che se ne può chiedere.
   */
  if (capability.kind === 'switch' && capability.pulse) {
    if (modo === 'se') {
      throw badRequest(`«${deviceName}» è a impulso e non si sa com’è rimasto, quindi non si può chiedere in una condizione`);
    }
    if (String(value) !== 'true') throw badRequest(`di «${deviceName}» si può chiedere solo quando scatta`);
    return;
  }
  if (!SOLO_ORDINI.has(capability.code)) return;
  throw badRequest(
    `di «${deviceName}» si sa solo l’ultimo ordine dato e non com’è adesso, quindi non si può chiedere in una condizione`,
  );
}
