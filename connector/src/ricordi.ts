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
    this.#scrivi = setTimeout(() => {
      this.#scrivi = null;
      this.#scriviOra(adesso);
    }, attesaMs);
    this.#scrivi.unref?.();
  }

  /** Subito, per quello che non deve andare perso se l'agente si ferma adesso. */
  salvaSubito(adesso: () => Iterable<[string, T]>): void {
    if (!this.file) return;
    if (this.#scrivi) clearTimeout(this.#scrivi);
    this.#scrivi = null;
    this.#scriviOra(adesso);
  }

  #scriviOra(adesso: () => Iterable<[string, T]>): void {
    try {
      fs.writeFileSync(this.file as string, JSON.stringify(Object.fromEntries(adesso())), { mode: 0o600 });
    } catch (error) {
      console.warn(`${this.nome}: non riesco a scrivere il file (${(error as Error).message})`);
    }
  }
}
