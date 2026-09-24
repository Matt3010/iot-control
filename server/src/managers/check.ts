import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { nonProvabile, siMisura, type NonProvabile } from '../../../shared/regole.js';
import { badRequest } from '../errors/HttpError.js';
import type { Op } from '../types.js';

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
  // un colore è una tinta sul cerchio, da 0 a 360
  if (capability.kind === 'color') {
    if (value < 0 || value > 360) throw badRequest(`«${capability.label}» va da 0 a 360`);
    return;
  }
  if (value < capability.min || value > capability.max) {
    throw badRequest(`«${capability.label}» sta fra ${capability.min} e ${capability.max}`);
  }
}

/** Come si dice a chi scrive la prova perché su quella cosa non si può. */
const PERCHE: Record<NonProvabile, (label: string, deviceName: string) => string> = {
  immagine: (_label, deviceName) => `«${deviceName}» si guarda e basta`,
  colore: (label, deviceName) => `«${label}» di «${deviceName}» è un colore, quindi non si può chiedere in una condizione`,
  impostazione: (label, deviceName) =>
    `«${label}» di «${deviceName}» è un’impostazione, quindi non si può chiedere in una condizione`,
  evento: (label, deviceName) =>
    `«${label}» di «${deviceName}» è un evento, quindi si chiede quando succede e non com’è`,
  impulso: (_label, deviceName) =>
    `«${deviceName}» è a impulso e non si sa com’è rimasto, quindi non si può chiedere in una condizione`,
  ordine: (_label, deviceName) =>
    `di «${deviceName}» si sa solo l’ultimo ordine dato e non com’è adesso, quindi non si può chiedere in una condizione`,
};

/**
 * Una prova su un dispositivo — «quando la porta si apre», «se sopra 25
 * gradi» — controllata e scritta nella sua forma: la soglia come numero, un
 * valore preciso come testo.
 *
 * Una funzione sola per gli avvisi, le partenze e le condizioni delle scene
 * (CLAUDE.md, «Le prove sui dispositivi»). Erano due controlli, e quello
 * degli avvisi lasciava scrivere «uguale a» su un numero, un interruttore
 * «acceso» con una parola qualunque e una telecamera.
 *
 * Se si può chiedere lo decide `nonProvabile` in `shared/regole.js`, lo
 * stesso che usa il sito per non mostrare quello che qui si rifiuta.
 */
export function provaDi(
  capability: Capability,
  deviceName: string,
  /** `quando` è una cosa che succede, `se` una cosa che è vera adesso. */
  modo: 'quando' | 'se',
  op: Op,
  value: unknown,
): { op: Op; value: string | number } {
  const perche = nonProvabile(capability, modo);
  if (perche) throw badRequest(PERCHE[perche](capability.label, deviceName));

  if (siMisura(capability)) {
    if (op === 'is') throw badRequest(`per «${deviceName}» si sceglie sopra o sotto un numero`);
    const soglia = Number(value);
    if (value === '' || value === null || !Number.isFinite(soglia)) throw badRequest('la soglia va scritta come numero');
    return { op, value: soglia };
  }

  if (op !== 'is') throw badRequest('sopra e sotto valgono solo per i numeri');
  const scritto = String(value);
  if (capability.kind === 'switch') {
    /*
     * A impulso torna spento dopo mezzo secondo: che scatti si vede, perché
     * l'impulso comincia con un'accensione, ed è l'unica cosa che se ne
     * può chiedere.
     */
    if (capability.pulse && scritto !== 'true') throw badRequest(`di «${deviceName}» si può chiedere solo quando scatta`);
    if (scritto !== 'true' && scritto !== 'false') throw badRequest('un interruttore è acceso o spento');
  }
  const parole = paroleDi(capability);
  if (parole && !parole.includes(scritto)) throw badRequest(`«${deviceName}» non ha il valore «${scritto}»`);
  return { op, value: scritto };
}

/** Le parole che si possono chiedere a una capacità che non si misura. */
const paroleDi = (capability: Capability): string[] | undefined =>
  capability.kind === 'enum' ? capability.values : capability.kind === 'sensor' ? capability.values : undefined;
