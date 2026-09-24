import type { Request } from 'express';

/**
 * Un pezzo di elenco, con il conto di quanto e' lungo.
 *
 * Il taglio vero lo fa il database, che e' l'unico a poterlo fare senza
 * mandare in giro le righe da buttare. Qui c'e' la forma della domanda e la
 * forma della risposta.
 *
 * Sta qui e non dentro un controllore perche' ogni elenco che cresce da solo
 * — gli avvisi, il registro di una casa, un giorno i luoghi — finisce per
 * volere la stessa cosa: dammene venti, e dimmi quanti sono in tutto. Senza
 * il totale chi guarda non sa se sta vedendo tutto o l'inizio di qualcosa, e
 * un «avanti» che non si sa dove porta non si preme.
 */
export interface Page<T> {
  rows: T[];
  /** Quanti ce ne sono in tutto, non quanti ne tornano adesso. */
  total: number;
  offset: number;
  limit: number;
}

export interface Ask {
  offset: number;
  limit: number;
  /**
   * In che ordine, se chi guarda l'ha chiesto e l'elenco lo sa fare.
   *
   * Sta nella domanda e non in un parametro a parte perché è della stessa
   * natura del taglio: un elenco a pagine si mette in fila dove si taglia,
   * se no la seconda pagina non continua la prima. Un giorno qui accanto
   * starà anche un filtro, e ogni elenco lo leggerà dallo stesso posto.
   */
  ordine?: { per: string; verso: 'asc' | 'desc' };
}

/**
 * Cosa ha chiesto chi guarda, ripulito.
 *
 * Quello che arriva dall'indirizzo e' testo di chiunque: un limite di un
 * milione svuoterebbe la memoria di questa macchina, e uno negativo
 * romperebbe lo slice. Si stringe fra uno e un massimo, e quello che non si
 * capisce diventa il valore normale.
 */
export function askOf(
  req: Request,
  fallback = 20,
  max = 100,
  /** I criteri che questo elenco sa usare. Gli altri si ignorano. */
  ordini: readonly string[] = [],
): Ask {
  const numero = (raw: unknown, se: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) ? value : se;
  };

  // un criterio che l'elenco non conosce vale come non chiesto: l'indirizzo
  // lo scrive chiunque, e dentro a una query ci finisce solo quello che è in
  // questo elenco
  const per = typeof req.query.ordine === 'string' && ordini.includes(req.query.ordine) ? req.query.ordine : undefined;
  const verso = req.query.verso === 'asc' ? 'asc' : 'desc';

  return {
    offset: Math.max(0, Math.floor(numero(req.query.offset, 0))),
    limit: Math.min(max, Math.max(1, Math.floor(numero(req.query.limit, fallback)))),
    ...(per ? { ordine: { per, verso } } : {}),
  };
}

