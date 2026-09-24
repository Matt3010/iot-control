import fs from 'node:fs';

/**
 * Un file dell'agente dove resta una cosa per ogni entità.
 *
 * Gli impulsi imparati, le forme viste, il tono di una sirena: tutte cose
 * che l'agente sa guardando e che la centrale non tiene. Si perdevano a ogni
 * riavvio, o ognuna le salvava a modo suo. Qui c'è il modo solo: si legge
 * all'avvio, e chi cambia qualcosa chiede di riscrivere. Un file che non si
 * legge non ferma l'agente: si ricomincia da capo e lo si dice.
 */
export class Ricordi<T> {
  #scrivi: NodeJS.Timeout | null = null;
  /** Cosa scrivere quando scade l'attesa, finché non è scritto. */
  #adesso: (() => Iterable<[string, T]>) | null = null;

  /**
   * `valido` tiene solo le voci che hanno la forma giusta: il file può venire
   * da una versione vecchia dell'agente, o essere stato toccato a mano.
   */
  constructor(
    private readonly file: string | undefined,
    private readonly nome: string,
    private readonly valido: (value: unknown) => value is T,
  ) {}

  leggi(): Map<string, T> {
    const out = new Map<string, T>();
    if (!this.file) return out;
    try {
      const letti = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      for (const [entityId, value] of Object.entries(letti)) if (this.valido(value)) out.set(entityId, value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`${this.nome}: il file non si legge, si ricomincia da capo (${(error as Error).message})`);
      }
    }
    return out;
  }

  /**
   * Riscrive il file con quello che dà `adesso`. Aspetta un attimo, perché
   * un giro d'inventario cambia tante voci insieme e basta scriverle una
   * volta.
   */
  salva(adesso: () => Iterable<[string, T]>, attesaMs = 2_000): void {
    if (!this.file || this.#scrivi) return;
    this.#adesso = adesso;
    inAttesa.add(this as Ricordi<unknown>);
    this.#scrivi = setTimeout(() => this.salvaSubito(adesso), attesaMs);
    this.#scrivi.unref?.();
  }

  /** Subito, per quello che non deve andare perso se l'agente si ferma adesso. */
  salvaSubito(adesso: () => Iterable<[string, T]>): void {
    if (!this.file) return;
    if (this.#scrivi) clearTimeout(this.#scrivi);
    this.#scrivi = null;
    this.#adesso = null;
    inAttesa.delete(this as Ricordi<unknown>);
    this.#scriviOra(adesso);
  }

  /** Scrive adesso quello che stava aspettando, se c'è. */
  finisci(): void {
    if (this.#adesso) this.salvaSubito(this.#adesso);
  }

  /**
   * Si scrive su un file accanto e poi lo si mette al posto del vecchio. Un
   * disco pieno o uno spegnimento a metà scrittura lasciavano un file
   * troncato, che al riavvio non si leggeva più: si perdeva tutto, non solo
   * l'ultima modifica. Lo spostamento invece o avviene o no, e nel secondo
   * caso resta il file di prima, intero.
   */
  #scriviOra(adesso: () => Iterable<[string, T]>): void {
    const file = this.file as string;
    const accanto = `${file}.${process.pid}.nuovo`;
    try {
      fs.writeFileSync(accanto, JSON.stringify(Object.fromEntries(adesso())), { mode: 0o600 });
      fs.renameSync(accanto, file);
    } catch (error) {
      fs.rmSync(accanto, { force: true });
      console.warn(`${this.nome}: non riesco a scrivere il file (${(error as Error).message})`);
    }
  }
}

/**
 * I file con una scrittura rimandata. Un agente che si ferma — SIGTERM da un
 * aggiornamento, un errore che lo fa ripartire — usciva subito e quello che
 * aspettava i suoi due secondi non veniva scritto mai: le forme viste
 * nell'ultimo giro sparivano proprio al riavvio, che è quando servono.
 * All'uscita, qualunque sia la strada, si scrive tutto quello che aspetta.
 */
const inAttesa = new Set<Ricordi<unknown>>();
process.on('exit', () => {
  for (const ricordi of [...inAttesa]) ricordi.finisci();
});
