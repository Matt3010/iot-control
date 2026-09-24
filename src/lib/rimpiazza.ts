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
