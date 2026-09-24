import type { DeviceValue } from '../../../shared/protocol.js';
import { hub } from '../iot/hub.js';
import { sceneManager } from '../managers/SceneManager.js';
import { store } from '../persistence/db.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { conditionsHold, crosses } from '../rules/prove.js';
import { noticeManager } from '../managers/NoticeManager.js';
import { DEFAULT_TZ, type Scene } from '../types.js';

/**
 * Le scene che partono quando in casa cambia qualcosa.
 *
 * L'orologio le fa partire a un'ora; qui le fa partire un dispositivo che
 * passa a un valore — la porta che si apre, la temperatura che supera 25.
 * Sul passaggio: quello che conta è il momento in cui cambia, e una sonda
 * che ripete 26 gradi ogni dieci secondi non fa partire niente di nuovo.
 */

/**
 * Il fusibile.
 *
 * I giri che si vedono dai dati — una scena che comanda quello che la fa
 * partire, direttamente o passando per altre — non si possono salvare
 * (`rules/giri.ts`). Restano quelli che dai dati non si vedono: una presa
 * che accende un sensore di movimento che fa ripartire la scena. Nessuna
 * persona fa partire una scena dieci volte in un minuto, quindi oltre
 * quella soglia si ferma e si avvisa. Sotto, ogni cambiamento la fa partire,
 * da qualunque parte arrivi.
 */
const SOGLIA = 10;
const FINESTRA_MS = 60_000;

/** Quando è partita da sola, di recente, ogni scena. */
const partenze = new Map<string, number[]>();

/** Se può ripartire, e se no avvisa, una volta sola per ogni fermata. */
function fusibile(scene: Scene): boolean {
  const adesso = Date.now();
  const recenti = (partenze.get(scene.id) ?? []).filter((quando) => adesso - quando < FINESTRA_MS);
  if (recenti.length >= SOGLIA) {
    // si avvisa quando scatta, non a ogni tentativo dopo
    if (recenti.length === SOGLIA) {
      recenti.push(adesso);
      partenze.set(scene.id, recenti);
      void noticeManager.tell(scene.ownerId, {
        kind: 'scene',
        who: scene.name,
        short: 'fermata, ripartiva da sola di continuo',
        title: `La scena «${scene.name}» è stata fermata`,
        body: 'È partita da sola più di dieci volte in un minuto, come se fosse in un giro. Guarda cosa la fa partire e cosa comanda.',
      });
      console.warn(`la scena «${scene.name}» è partita da sola ${SOGLIA} volte in un minuto, fermata`);
    }
    return false;
  }
  recenti.push(adesso);
  partenze.set(scene.id, recenti);
  return true;
}

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

    if (!fusibile(scene)) continue;

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
