import { sceneManager } from '../managers/SceneManager.js';
import { store } from '../persistence/JsonStore.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import type { Scene } from '../types.js';

/**
 * Le scene che partono da sole.
 *
 * Un orario a muro e i giorni in cui vale: «le sette di sera, dal lunedì al
 * venerdì». L'ora è quella di un orologio appeso in casa e non un istante
 * assoluto, perché a ottobre le lancette si spostano e le sette devono
 * restare le sette — chi ha scritto «chiudi le tende alle 19» non intendeva
 * «alle 18 da quando torna l'ora solare».
 *
 * Il battito è più fitto di un minuto apposta: se la macchina era occupata a
 * fare altro, l'orario non si perde. A non farla partire due volte ci pensa
 * il turno preso nell'archivio, non la frequenza del battito.
 */
const EVERY_MS = 20_000;

/** Che ore sono, e che giorno è, dove stanno quelle lancette. */
function localNow(tz: string): { minute: string; day: number; clock: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date());

  const bit = (what: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === what)?.value ?? '';

  const GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const clock = `${bit('hour')}:${bit('minute')}`;

  return {
    minute: `${bit('year')}-${bit('month')}-${bit('day')} ${clock}`,
    day: GIORNI.indexOf(bit('weekday')),
    clock,
  };
}

/** Se è il suo momento, adesso. */
function due(scene: Scene): { yes: boolean; minute: string } {
  const when = scene.when;
  if (!when || when.off || !scene.steps.length) return { yes: false, minute: '' };

  let now: ReturnType<typeof localNow>;
  try {
    now = localNow(when.tz);
  } catch {
    // Un fuso che non esiste — scritto a mano, o sparito da una versione di
    // node all'altra — non deve fermare l'orologio di tutti gli altri.
    return { yes: false, minute: '' };
  }

  const oggi = !when.days.length || when.days.includes(now.day);
  return { yes: oggi && now.clock === when.at, minute: now.minute };
}

/** Un giro solo. Esportato perché si possa provare senza aspettare un minuto. */
export async function tick(): Promise<void> {
  const scenes = await store.transaction((tx) => tx.data.scenes.slice());

  for (const scene of scenes) {
    const { yes, minute } = due(scene);
    if (!yes) continue;

    /*
     * Prima il turno, poi il lavoro. Se la scrittura non vince vuol dire che
     * quel minuto l'ha già preso qualcuno — un altro battito, un altro
     * server — e qui non si fa niente.
     */
    const mio = await store.transaction((tx) => new SceneRepository(tx).claim(scene.id, minute));
    if (!mio) continue;

    await sceneManager
      .run(scene.ownerId, scene.id)
      // Una scena che parte da sola e trova una tenda muta non è un guasto
      // del server: nel registro della casa c'è già scritto cosa non ha
      // risposto, e qui si tira avanti con le altre.
      .catch((error: Error) => console.warn(`«${scene.name}» non è partita tutta: ${error.message}`));
  }
}

export function watchClock(): void {
  setInterval(() => void tick().catch((error: Error) => console.warn(`orologio: ${error.message}`)), EVERY_MS).unref();
}
