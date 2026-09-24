import { Ricordi } from './ricordi.js';
import type { Capability } from '../../shared/protocol.js';

/**
 * La forma di ogni entità com'era l'ultima volta che la si conosceva.
 *
 * Quando la centrale perde un dispositivo, o si riavvia, lo stato diventa
 * `unavailable` e gli attributi che dipendono dallo stato spariscono: i gradi
 * in stanza, la batteria, il tipo di un tracker. Ricavare le capacità da quello
 * che resta voleva dire una forma diversa a ogni caduta, e ogni forma diversa
 * rimanda l'inventario intero; peggio, una cosa che per un giro non si sapeva
 * tradurre spariva dall'inventario, e il server la segnava sparita con le sue
 * scene. Qui si tiene l'ultima forma conosciuta, e finché lo stato non si sa
 * vale quella.
 *
 * È anche la firma con cui si capisce, a ogni cambiamento, se è cambiata la
 * forma o solo lo stato: il confronto si fa una volta sola, qui.
 *
 * Resta in un file dell'agente, così anche dopo un riavvio di tutti e due una
 * cosa che la centrale non sente ancora ha la forma di prima.
 */

interface Forma {
  capabilities: Capability[];
  /** Se è stata vista con uno stato conosciuto: solo allora vale come ricordo. */
  nota: boolean;
}

/** Due valori da JSON uguali, confrontati pezzo per pezzo, senza trasformarli in testo. */
export function uguali(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((one, at) => uguali(one, b[at]));
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => uguali((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export class Forme {
  #forme = new Map<string, Forma>();
  #file: Ricordi<Capability[]>;

  constructor(file?: string) {
    this.#file = new Ricordi(file, 'forme', (value): value is Capability[] => Array.isArray(value));
    for (const [entityId, capabilities] of this.#file.leggi()) this.#forme.set(entityId, { capabilities, nota: true });
  }

  get(entityId: string): Forma | undefined {
    return this.#forme.get(entityId);
  }

  /** Tiene la forma di adesso. Torna vero se è diversa da quella di prima. */
  tieni(entityId: string, capabilities: Capability[], nota: boolean): boolean {
    const prima = this.#forme.get(entityId);
    const diversa = !prima || !uguali(prima.capabilities, capabilities);
    if (!diversa && (prima?.nota || !nota)) return false;
    this.#forme.set(entityId, { capabilities, nota });
    if (nota) this.#salva();
    return diversa;
  }

  /** Dimentica le entità che l'anagrafe non conosce più. */
  soloQueste(conosciute: Set<string>): void {
    let tolte = false;
    for (const entityId of this.#forme.keys()) {
      if (conosciute.has(entityId)) continue;
      this.#forme.delete(entityId);
      tolte = true;
    }
    if (tolte) this.#salva();
  }

  #salva(): void {
    // solo quelle viste con uno stato, e non vuote: una forma vuota si rifà uguale da sola
    this.#file.salva(() =>
      [...this.#forme]
        .filter(([, forma]) => forma.nota && forma.capabilities.length)
        .map(([id, forma]) => [id, forma.capabilities] as [string, Capability[]]),
    );
  }
}
