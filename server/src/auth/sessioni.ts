/**
 * Le sessioni che si chiudono mentre qualcosa è ancora aperto.
 *
 * Un token si ricontrolla a ogni richiesta (`strategy.ts`), ma il filo degli
 * aggiornamenti è una richiesta sola che resta aperta per ore: chiusa la
 * sessione — password cambiata, «esci da tutte le sessioni» — quel filo
 * continuava a raccontare la casa a un browser che non doveva più vederla.
 * Chi apre un filo si mette in ascolto qui con il numero di sessione del suo
 * token, e quando il numero sale il filo si chiude. Il browser, riaprendolo,
 * trova la porta chiusa.
 */
const aperti = new Map<string, Set<{ versione: number; jti: string; chiudi: () => void }>>();

/** Un filo aperto con quel numero di sessione. Torna la funzione che lo toglie quando si chiude da sé. */
export function ascolta(userId: string, versione: number, jti: string, chiudi: () => void): () => void {
  const uno = { versione, jti, chiudi };
  const suoi = aperti.get(userId) ?? new Set();
  suoi.add(uno);
  aperti.set(userId, suoi);
  return () => {
    suoi.delete(uno);
    if (!suoi.size) aperti.delete(userId);
  };
}

/** Le sessioni di quell'account sotto questo numero non valgono più: i loro fili si chiudono. */
export function chiudiSotto(userId: string, versione: number): void {
  for (const uno of [...(aperti.get(userId) ?? [])]) if (uno.versione < versione) uno.chiudi();
}

/** Il browser di quel token è uscito, e il suo filo, se è ancora aperto, si chiude. */
export function chiudiToken(userId: string, jti: string): void {
  for (const uno of [...(aperti.get(userId) ?? [])]) if (uno.jti === jti) uno.chiudi();
}
