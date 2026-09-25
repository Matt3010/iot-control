/**
 * Il conto del fusibile: quante volte ogni scena è partita da sola
 * nell'ultimo minuto.
 *
 * Sta a sé perché lo toccano in due: chi ascolta i passaggi lo fa salire
 * (`services/SceneTriggers.ts`), e chi cambia una scena o la fa partire a
 * mano lo azzera (`SceneManager`). Il conto non si azzera quando il
 * fusibile salta: i passaggi che arrivano subito dopo, anche quelli che
 * erano già in viaggio, lo trovano ancora pieno e non partono. Si svuota da
 * solo quando passa il minuto, o quando qualcuno riaccende la scena.
 */

/** Più di tante partenze da sola in un minuto, e la scena si ferma. */
export const SOGLIA = 10;
const FINESTRA_MS = 60_000;

const partenze = new Map<string, number[]>();

/** Via quello che è più vecchio della finestra: una scena cancellata non lascia niente qui dentro. */
function ripulisci(adesso: number): void {
  for (const [id, quando] of partenze) {
    const recenti = quando.filter((one) => adesso - one < FINESTRA_MS);
    if (recenti.length) partenze.set(id, recenti);
    else partenze.delete(id);
  }
}

/**
 * Una partenza in più, se c'è posto. Torna falso se il conto è già pieno:
 * allora la scena non parte, e tocca a chi chiama far saltare il fusibile.
 */
export function contaPartenza(sceneId: string, adesso = Date.now()): boolean {
  ripulisci(adesso);
  const recenti = partenze.get(sceneId) ?? [];
  if (recenti.length >= SOGLIA) return false;
  partenze.set(sceneId, [...recenti, adesso]);
  return true;
}

/** Qualcuno ha riacceso la scena, cambiandola o premendola: il conto riparte da zero. */
export function riarma(sceneId: string): void {
  partenze.delete(sceneId);
}
