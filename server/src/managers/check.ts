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
