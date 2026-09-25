import { hub } from '../iot/hub.js';
import { sceneManager } from '../managers/SceneManager.js';
import { casaDi } from '../managers/raggio.js';
import { store } from '../persistence/db.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { DEFAULT_TZ, type Scene } from '../types.js';
import { conditionsHold, localNow, oraVera } from '../rules/prove.js';
import { UserRepository } from '../repositories/UserRepository.js';

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

/** Che ore sono nel fuso di qualcuno: la risposta di `localNow`. */
type Ora = ReturnType<typeof localNow>;

/**
 * Se è il suo momento, adesso. E se quel momento è già passato per sempre.
 *
 * Le ore sono quelle di chi ha la scena, non quelle scritte dentro
 * l'orario: prima ogni orario si portava il fuso del browser in cui era nato,
 * e uno scritto in viaggio restava in un altro fuso per sempre.
 */
function due(scene: Scene, now: Ora | undefined, tz: string): { yes: boolean; over: boolean } {
  const when = scene.when;
  const niente = { yes: false, over: false };
  if (!now || !when || when.off || !scene.steps.length) return niente;
  // l'ora di quel giorno: quella scritta, o la prima che c'è se quel giorno le lancette la saltano
  const ora = oraVera(tz, now.date, when.at);

  /*
   * Una volta sola: conta la data, non il giorno della settimana. E se quel
   * giorno e' passato — la macchina era spenta, o l'ora non e' mai arrivata
   * — l'orario si toglie invece di restare li' a indicare l'anno scorso.
   */
  if (when.on) {
    if (when.on < now.date) return { ...niente, over: true };
    return { yes: when.on === now.date && now.clock === ora, over: false };
  }

  const oggi = !when.days.length || when.days.includes(now.day);
  return { yes: oggi && now.clock === ora, over: false };
}

/**
 * Un giro solo. Esportato perché si possa provare senza aspettare un minuto.
 *
 * L'ora si chiede una volta per fuso e per giro, non una per scena: cento
 * scene nello stesso fuso sono nello stesso minuto. E le scene partono
 * insieme, senza aspettarsi: una che dura venti secondi perché una tenda
 * non risponde non deve far arrivare in ritardo quella dopo.
 */
export async function tick(at = new Date()): Promise<void> {
  const { scenes, fusi } = await store.transaction(async (tx) => {
    const tutte = await new SceneRepository(tx).findTimed();
    return { scenes: tutte, fusi: await new UserRepository(tx).tzOf([...new Set(tutte.map((scene) => scene.ownerId))]) };
  });

  const ore = new Map<string, Ora | undefined>();
  const oraIn = (tz: string): Ora | undefined => {
    if (!ore.has(tz)) {
      try {
        ore.set(tz, localNow(tz, at));
      } catch {
        // Un fuso che non esiste — scritto a mano, o sparito da una versione
        // di node all'altra — non deve fermare l'orologio di tutti gli altri.
        ore.set(tz, undefined);
      }
    }
    return ore.get(tz);
  };

  const parti = async (scene: Scene): Promise<void> => {
    const tz = fusi.get(scene.ownerId) ?? DEFAULT_TZ;
    const now = oraIn(tz);
    const { yes, over } = due(scene, now, tz);

    // passato senza partire: l'orario se ne va, e lo si dice
    if (over) return void (await sceneManager.scordaOrario(scene, true));
    // una scena fermata dal fusibile non parte da sola, finché qualcuno non la tocca
    if (!yes || !now || scene.blownAt) return;

    // l'ora è quella, ma deve valere anche il resto di quello che hai scritto
    if (!conditionsHold(scene.only, (id) => hub.stateOf(id), tz, at, true)) return;

    /*
     * Prima il turno, poi il lavoro. Se la scrittura non vince vuol dire che
     * quel minuto l'ha già preso qualcuno — un altro battito, un altro
     * server — e qui non si fa niente.
     */
    const mio = await store.transaction((tx) => new SceneRepository(tx).claim(scene.id, now.minute));
    if (!mio) return;

    // Una volta sola vuol dire una volta sola: l'orario se ne va appena
    // servito, anche se la scena e' partita a meta'.
    if (scene.when?.on) await sceneManager.scordaOrario(scene, false);

    await sceneManager.run(casaDi(scene.ownerId), scene.id);
  };

  const esiti = await Promise.allSettled(scenes.map(parti));
  esiti.forEach((esito, at) => {
    // Una scena che parte da sola e trova una tenda muta non è un guasto
    // del server: nel registro della casa c'è già scritto cosa non ha
    // risposto, e qui si tira avanti con le altre.
    if (esito.status === 'rejected') {
      console.warn(`la scena «${scenes[at]?.name}» non è andata fino in fondo, ${(esito.reason as Error).message}`);
    }
  });
}

export function watchClock(): void {
  setInterval(() => void tick().catch((error: Error) => console.warn(`orologio: ${error.message}`)), EVERY_MS).unref();
}
