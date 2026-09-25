/**
 * Quante volte si è sbagliato a entrare, per email e per indirizzo.
 *
 * Esiste perché senza un limite una password si prova a raffica: sessanta
 * tentativi in quattro secondi, e il sessantunesimo entra. Qui i primi
 * sbagli sono liberi — chi scrive di fretta sbaglia — e dopo ogni sbaglio
 * in più costa un'attesa che raddoppia, fino a un tetto. Una volta entrati,
 * il conto di quell'email si azzera; quello dell'indirizzo no, perché da un
 * indirizzo solo si possono provare molte email.
 *
 * Sta in memoria: un riavvio lo azzera, e con più server ognuno conta per
 * sé. Va bene lo stesso, perché quello che conta è che le prove non costino
 * niente, e anche così costano minuti invece di millisecondi.
 */

/** Dopo quanto tempo senza sbagli il conto riparte da zero. */
const FINESTRA_MS = 15 * 60_000;
/** L'attesa più lunga, anche dopo cento sbagli. */
const TETTO_MS = 15 * 60_000;
/** Oltre questi conti aperti si buttano quelli fermi, perché la memoria non cresca per sempre. */
const TANTI = 10_000;

interface Conto {
  sbagli: number;
  ultimo: number;
  /** Fino a quando non si può riprovare. */
  finoA: number;
}

export class Tentativi {
  #conti = new Map<string, Conto>();

  constructor(
    /** Quanti sbagli si possono fare prima di cominciare ad aspettare. */
    private readonly liberi: number,
  ) {}

  /** Quanti millisecondi bisogna ancora aspettare per quella chiave. Zero vuol dire che si può provare. */
  attesa(chiave: string, adesso = Date.now()): number {
    const conto = this.#vivo(chiave, adesso);
    return conto ? Math.max(0, conto.finoA - adesso) : 0;
  }

  /** Uno sbaglio in più. Torna quanto bisogna aspettare adesso, zero se è ancora fra quelli liberi. */
  sbagliato(chiave: string, adesso = Date.now()): number {
    if (this.#conti.size > TANTI) this.#pulisci(adesso);
    const conto = this.#vivo(chiave, adesso) ?? { sbagli: 0, ultimo: adesso, finoA: 0 };
    conto.sbagli += 1;
    conto.ultimo = adesso;
    const oltre = conto.sbagli - this.liberi;
    conto.finoA = oltre > 0 ? adesso + Math.min(TETTO_MS, 1000 * 2 ** (oltre - 1)) : 0;
    this.#conti.set(chiave, conto);
    return Math.max(0, conto.finoA - adesso);
  }

  /** È entrato: quel conto riparte da zero. */
  riuscito(chiave: string): void {
    this.#conti.delete(chiave);
  }

  /** Un conto fermo da più della finestra, e senza un'attesa ancora in corso, non conta più. */
  #vivo(chiave: string, adesso: number): Conto | undefined {
    const conto = this.#conti.get(chiave);
    if (!conto) return undefined;
    if (adesso - conto.ultimo > FINESTRA_MS && adesso >= conto.finoA) {
      this.#conti.delete(chiave);
      return undefined;
    }
    return conto;
  }

  #pulisci(adesso: number): void {
    for (const chiave of [...this.#conti.keys()]) this.#vivo(chiave, adesso);
  }
}

/** Per email: cinque sbagli liberi, poi un secondo, due, quattro… */
export const perEmail = new Tentativi(5);
/** Per indirizzo: più larghi, perché dietro a un indirizzo possono esserci una casa o un ufficio interi. */
export const perIndirizzo = new Tentativi(20);

/** Quanto aspettare, detto come lo direbbe una persona: «8 secondi», «un minuto», «4 minuti». */
export function detto(ms: number): string {
  const secondi = Math.max(1, Math.ceil(ms / 1000));
  if (secondi === 1) return 'un secondo';
  if (secondi < 60) return `${secondi} secondi`;
  const minuti = Math.ceil(secondi / 60);
  return minuti === 1 ? 'un minuto' : `${minuti} minuti`;
}
