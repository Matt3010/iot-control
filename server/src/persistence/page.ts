import type { Request } from 'express';

/**
 * Un pezzo di elenco, con il conto di quanto e' lungo.
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
}

/**
 * Cosa ha chiesto chi guarda, ripulito.
 *
 * Quello che arriva dall'indirizzo e' testo di chiunque: un limite di un
 * milione svuoterebbe la memoria di questa macchina, e uno negativo
 * romperebbe lo slice. Si stringe fra uno e un massimo, e quello che non si
 * capisce diventa il valore normale.
 */
export function askOf(req: Request, fallback = 20, max = 100): Ask {
  const numero = (raw: unknown, se: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) ? value : se;
  };

  return {
    offset: Math.max(0, Math.floor(numero(req.query.offset, 0))),
    limit: Math.min(max, Math.max(1, Math.floor(numero(req.query.limit, fallback)))),
  };
}

/** Il pezzo chiesto, da un elenco gia' in ordine. */
export function pageOf<T>(all: T[], ask: Ask): Page<T> {
  return {
    rows: all.slice(ask.offset, ask.offset + ask.limit),
    total: all.length,
    offset: ask.offset,
    limit: ask.limit,
  };
}
