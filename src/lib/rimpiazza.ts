/**
 * Mette al posto di un oggetto quello nuovo, tenendolo lo stesso oggetto.
 *
 * Lo stesso perché chi lo sta mostrando ne tiene il riferimento, e un
 * oggetto nuovo nell'elenco lascerebbe una finestra aperta sul vecchio.
 * `Object.assign` da solo però aggiunge e non toglie. Un campo vuoto non
 * viaggia, quindi un orario spento arrivava come una scena senza `when` e
 * quello vecchio restava lì. Quello che nel nuovo manca si toglie, tranne
 * i campi che esistono solo qui (`tieni`), come il `key` di un luogo.
 */
export function rimpiazza<T extends object>(target: T, value: T, tieni: readonly string[] = []): T {
  const vecchio = target as Record<string, unknown>;
  for (const key of Object.keys(vecchio)) if (!(key in value) && !tieni.includes(key)) delete vecchio[key];
  return Object.assign(target, value);
}

/**
 * Rimette com'era solo quello che una modifica aveva cambiato, e solo se
 * nessun'altra ci ha scritto sopra nel frattempo.
 *
 * Due salvataggi della stessa cosa possono essere in volo insieme — il nome
 * e poi il colore di una categoria — e se il primo va male, rimettere
 * l'oggetto intero com'era prima di lui cancellava anche il secondo, che
 * intanto il server aveva preso. Sullo schermo restava il colore vecchio,
 * sul server quello nuovo.
 */
export function ritira<T extends object>(target: T, patch: Partial<T>, before: T): void {
  const qui = target as Record<string, unknown>;
  const prima = before as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    // per valore e non per identità, perché un elenco messo in uno stato vivo ne esce avvolto
    if (qui[key] !== value && JSON.stringify(qui[key]) !== JSON.stringify(value)) continue;
    if (key in prima) qui[key] = prima[key];
    else delete qui[key];
  }
}
