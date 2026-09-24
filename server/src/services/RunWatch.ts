import { sceneManager } from '../managers/SceneManager.js';

/** Ogni quanto batte una partenza viva. */
const BATTITO_MS = 60_000;
/**
 * Dopo quanto senza battito una partenza è ferma: più di due battiti, perché
 * un giro lento o un database occupato per qualche secondo non la facciano
 * sembrare morta.
 */
const FERMA_MS = BATTITO_MS * 2 + 30_000;

/**
 * Le scene con un'attesa dentro, tenute d'occhio.
 *
 * Chi le esegue batte ogni minuto; chi guarda scrive nel registro quelle che
 * non battono più, perché il servizio che le eseguiva si è fermato. Vale per
 * questo server dopo un riavvio e per un altro server che si è spento, e non
 * prende mai quelle che qualcuno sta ancora eseguendo.
 */
export function watchRuns(): void {
  const giro = async (): Promise<void> => {
    await sceneManager.battito();
    await sceneManager.interrotte(new Date(Date.now() - FERMA_MS));
  };
  const avanti = (): void => void giro().catch((error: Error) => console.warn(`scene rimaste a metà, ${error.message}`));
  avanti();
  setInterval(avanti, BATTITO_MS).unref();
}
