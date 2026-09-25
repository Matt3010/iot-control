import { hub, type Cambio } from '../iot/hub.js';
import { contaPartenza, SOGLIA } from '../managers/fusibile.js';
import { guardati } from '../managers/guardati.js';
import { sceneManager } from '../managers/SceneManager.js';
import { casaDi } from '../managers/raggio.js';
import { store } from '../persistence/db.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { conditionsHold, crosses } from '../rules/prove.js';
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
 *
 * Fermata vuol dire fermata: resta scritto sulla scena (`blownAt`) e non si
 * riarma da solo, se no un giro vero ripartirebbe dopo un minuto e
 * rimanderebbe l'avviso ogni minuto per sempre. La riaccende chi la cambia
 * o la fa partire a mano. Il conto sta in `managers/fusibile.ts`.
 */
export { SOGLIA } from '../managers/fusibile.js';

/** Se può ripartire. Se no fa saltare il fusibile, e avvisa chi lo fa saltare davvero. */
async function fusibile(scene: Scene, adesso = Date.now()): Promise<boolean> {
  if (contaPartenza(scene.id, adesso)) return true;
  const fermata = await sceneManager.blow(scene.id);
  if (fermata) console.warn(`la scena «${scene.name}» è partita da sola ${SOGLIA} volte in un minuto, fermata`);
  return false;
}

/**
 * I cambiamenti di un messaggio di stato, tutti insieme. Una scena parte al
 * massimo una volta per messaggio, anche se più d'una delle sue partenze
 * scatta nello stesso istante: l'interruttore e la luce che ci sta dentro
 * che si accendono insieme sono una cosa sola che succede, e contarla due
 * volte faceva partire la scena due volte e la avvicinava al fusibile.
 *
 * Esportato perché si possa provare senza un dispositivo vero.
 */
export async function happened(deviceId: string, cambi: Cambio[], adesso = Date.now()): Promise<void> {
  // quasi tutti i cambiamenti non fanno partire niente, e lo si sa senza chiederlo al database
  const utili: Cambio[] = [];
  for (const cambio of cambi) if (await guardati.daPartenze(deviceId, cambio.code)) utili.push(cambio);
  if (!utili.length) return;

  const { scenes, fusi } = await store.transaction(async (tx) => {
    const trovate = await new SceneRepository(tx).findTriggeredBy(deviceId, [...new Set(utili.map((one) => one.code))]);
    return { scenes: trovate, fusi: await new UserRepository(tx).tzOf([...new Set(trovate.map((one) => one.ownerId))]) };
  });

  for (const scene of scenes) {
    // una scena fermata dal fusibile resta ferma finché qualcuno non la tocca
    if (!scene.steps.length || scene.blownAt) continue;

    const scatta = (scene.triggers ?? []).some(
      (trigger) =>
        trigger.deviceId === deviceId &&
        utili.some((cambio) => cambio.code === trigger.code && crosses(trigger, cambio.before, cambio.value)),
    );
    if (!scatta) continue;

    const tz = fusi.get(scene.ownerId) ?? DEFAULT_TZ;
    if (!conditionsHold(scene.only, (id) => hub.stateOf(id), tz)) continue;

    if (!(await fusibile(scene, adesso))) continue;

    void sceneManager
      .run(casaDi(scene.ownerId), scene.id)
      .catch((error: Error) => console.warn(`la scena «${scene.name}» non è andata fino in fondo, ${error.message}`));
  }
}

/** Parte con il server: da qui ascolta ogni passaggio di stato in ogni casa. */
export function watchTriggers(): void {
  hub.watchesChanges((deviceId, cambi) => {
    void happened(deviceId, cambi).catch((error: Error) => console.warn(`scene su ${deviceId}, ${error.message}`));
  });
}
