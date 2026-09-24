import type { DeviceValue } from '../../../shared/protocol.js';
import { hub } from '../iot/hub.js';
import { sceneManager } from '../managers/SceneManager.js';
import { store } from '../persistence/db.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { conditionsHold, crosses } from '../rules/prove.js';
import { DEFAULT_TZ } from '../types.js';

/**
 * Le scene che partono quando in casa cambia qualcosa.
 *
 * L'orologio le fa partire a un'ora; qui le fa partire un dispositivo che
 * passa a un valore — la porta che si apre, la temperatura che supera 25.
 * Sul passaggio: quello che conta è il momento in cui cambia, e una sonda
 * che ripete 26 gradi ogni dieci secondi non fa partire niente di nuovo.
 */

/**
 * Quanto aspetta una scena prima di poter ripartire da sola.
 *
 * Due scene possono rincorrersi: «quando la luce si accende, spegni la
 * presa» e «quando la presa si spegne, accendi la luce» farebbero lampeggiare
 * la casa per sempre. Una scena appena partita non riparte per un minuto,
 * che basta a spezzare il giro.
 *
 * Ma un giro passa solo dai nostri comandi. Se il cambiamento l'ha fatto una
 * persona — il pulsante a muro, l'app del provider — la pausa non serve, e
 * toglieva la seconda pressione a chi preme due volte per accendere e poi
 * spegnere. Nostro vuol dire un comando mandato a quel dispositivo da poco:
 * un agente risponde in pochi secondi, e dieci bastano anche a uno lento.
 */
const PAUSA_MS = 60_000;
const ECO_MS = 10_000;

async function happened(deviceId: string, code: string, value: DeviceValue, before: DeviceValue | undefined): Promise<void> {
  const { scenes, fusi } = await store.transaction(async (tx) => {
    const trovate = await new SceneRepository(tx).findTriggeredBy(deviceId, code);
    return { scenes: trovate, fusi: await new UserRepository(tx).tzOf([...new Set(trovate.map((one) => one.ownerId))]) };
  });

  for (const scene of scenes) {
    if (!scene.steps.length) continue;

    const scatta = (scene.triggers ?? []).some(
      (trigger) => trigger.deviceId === deviceId && trigger.code === code && crosses(trigger, before, value),
    );
    if (!scatta) continue;

    const tz = fusi.get(scene.ownerId) ?? DEFAULT_TZ;
    if (!conditionsHold(scene.only, (id) => hub.stateOf(id), tz)) continue;

    /*
     * Il minuto si conta dall'inizio, e una scena con dentro un'attesa più
     * lunga premeva il suo stesso pulsante quando il minuto era già passato,
     * ripartendo per sempre. Finché sta andando, e per qualche secondo dopo
     * — il suo ultimo comando può essere proprio quello — i nostri comandi
     * non la fanno ripartire.
     */
    const nostro = hub.comandatoDaPoco(deviceId, ECO_MS);
    const recente = !!scene.ranAt && Date.now() - Date.parse(scene.ranAt) < PAUSA_MS;
    if (nostro && (recente || hub.inCorsaODaPoco(scene.id, ECO_MS))) {
      console.warn(`la scena «${scene.name}» non riparte, il cambiamento l’ha provocato un nostro comando mentre andava o da poco`);
      continue;
    }

    await sceneManager
      .run(scene.ownerId, scene.id)
      .catch((error: Error) => console.warn(`la scena «${scene.name}» non è andata fino in fondo: ${error.message}`));
  }
}

/** Parte con il server: da qui ascolta ogni passaggio di stato in ogni casa. */
export function watchTriggers(): void {
  hub.watchesChanges((deviceId, code, value, before) => {
    void happened(deviceId, code, value, before).catch((error: Error) =>
      console.warn(`scene su ${deviceId}, ${error.message}`),
    );
  });
}
