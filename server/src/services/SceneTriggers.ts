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
 * che basta a spezzare il giro e non disturba nessuno che la preme a mano.
 */
const PAUSA_MS = 60_000;

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

    if (scene.ranAt && Date.now() - Date.parse(scene.ranAt) < PAUSA_MS) {
      console.warn(`la scena «${scene.name}» è appena partita, non riparte da sola per un minuto`);
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
