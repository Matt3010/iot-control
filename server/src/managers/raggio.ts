import { siGuarda } from '../../../shared/regole.js';
import { forbidden } from '../errors/HttpError.js';
import { store, type Transaction } from '../persistence/db.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import type { Scene, SceneCondition, Scope } from '../types.js';

/**
 * Quello che una richiesta vede dell'indice su cui lavora.
 *
 * Esiste perché la stessa domanda — «questo agente, questa scena, questo
 * dispositivo, li vede?» — la fanno gli elenchi, i comandi, le modifiche e il
 * filo aperto, e scritta in ognuno diventava quattro risposte diverse. Qui è
 * una sola: chi la chiede la riceve già fatta, e non sa com'è costruita.
 *
 * A casa propria si vede tutto, e non si legge niente per saperlo. Da ospite
 * si parte dai luoghi che si possono toccare: gli agenti appesi lì, i loro
 * dispositivi tranne le telecamere, le scene che nominano solo quelli e le
 * regole scritte su di loro. Il resto per un ospite non esiste, e a chi
 * chiede di una cosa che non esiste si risponde come per un id sbagliato.
 */
export interface Raggio {
  /** A casa propria: tutto quello che è del padrone. */
  padrone: boolean;
  /** Le mappe che si vedono e i luoghi che ci stanno sopra. */
  maps: ReadonlySet<string>;
  places: ReadonlySet<string>;
  agents: ReadonlySet<string>;
  devices: ReadonlySet<string>;
  scenes: ReadonlySet<string>;
  vedeMappa(id: string): boolean;
  vedeLuogo(id: string): boolean;
  vedeAgente(id: string): boolean;
  vedeDispositivo(id: string): boolean;
  vedeScena(id: string): boolean;
}

const nessuno: ReadonlySet<string> = new Set();

/** Il raggio di chi è a casa sua: tutto, senza leggerlo. */
const tutto: Raggio = {
  padrone: true,
  maps: nessuno,
  places: nessuno,
  agents: nessuno,
  devices: nessuno,
  scenes: nessuno,
  vedeMappa: () => true,
  vedeLuogo: () => true,
  vedeAgente: () => true,
  vedeDispositivo: () => true,
  vedeScena: () => true,
};

/** La casa di qualcuno vista da lui: serve a chi lavora senza una richiesta, come l'orologio. */
export const casaDi = (ownerId: string): Scope => ({ ownerId, maps: null, places: null });

/** Se questa richiesta lavora a casa sua. */
export const aCasa = (scope: Scope): boolean => scope.maps === null;

/**
 * Le cose che fa solo chi possiede l'indice: gli agenti, i loro token, gli
 * account collegati, i dispositivi da togliere. Si chiama dopo aver
 * controllato che la cosa si veda, così a un ospite una cosa che non vede
 * resta un 404 e non diventa un «esiste, ma non è tua».
 */
export function soloPadrone(scope: Scope): void {
  if (!aCasa(scope)) throw forbidden('Questa cosa la fa solo chi possiede l’indice.');
}

/**
 * Categorie e gruppi sono del padrone e valgono su tutte le sue mappe, anche
 * su quelle che a un ospite non sono aperte. Rinominarli o toglierli cambia
 * luoghi che l'ospite non tocca, quindi lo fa solo il padrone. Crearne uno
 * nuovo invece non cambia niente di nessuno, e serve a chi aggiunge luoghi:
 * lo può fare l'ospite che i luoghi li può aggiungere, cioè quello a cui una
 * mappa è aperta tutta, e non quello che ne può toccare solo alcuni.
 */
export function puoEtichettare(scope: Scope, cosa: string): void {
  if (scope.places !== null) {
    throw forbidden(`${cosa} nuove le crea chi può aggiungere luoghi, e a te ne sono aperti solo alcuni.`);
  }
}

/** I dispositivi che una scena nomina da sé: righe, partenze e condizioni. */
function nominati(scene: Pick<Scene, 'steps' | 'triggers' | 'only'>): string[] {
  const out: string[] = [];
  for (const step of scene.steps ?? []) if (step.deviceId) out.push(step.deviceId);
  for (const trigger of scene.triggers ?? []) out.push(trigger.deviceId);
  const giu = (condition: SceneCondition): void => {
    if (condition.kind === 'group') condition.items.forEach(giu);
    else if (condition.kind === 'device') out.push(condition.deviceId);
  };
  if (scene.only) giu(scene.only);
  return out;
}

/** Appena nata: niente righe, niente partenze, niente condizioni, niente orario. */
const vuota = (scene: Scene): boolean =>
  !scene.steps?.length && !scene.triggers?.length && !scene.only?.items.length && !scene.when;

/**
 * Le scene che si vedono, dati i dispositivi che si vedono.
 *
 * Una scena si vede se tutti i dispositivi che nomina si vedono, se si vedono
 * anche le scene che chiama, e se alla fine comanda o guarda almeno un
 * dispositivo. Una scena fatta solo di avvisi e di orari non è di nessun
 * luogo, e resta di chi possiede l'indice. Fa eccezione quella ancora del
 * tutto vuota, appena nata: non nomina niente e non fa niente, e senza
 * vederla un ospite non potrebbe scriverne una. Un giro di chiamate non si
 * percorre due volte: il server non lo fa salvare, e qui basta non girarci
 * dentro.
 */
export function sceneVisibili(scenes: readonly Scene[], devices: ReadonlySet<string>): Set<string> {
  const perId = new Map(scenes.map((scene) => [scene.id, scene]));
  const esito = new Map<string, boolean>();
  const inCorso = new Set<string>();

  const vede = (scene: Scene): boolean => {
    const noto = esito.get(scene.id);
    if (noto !== undefined) return noto;
    if (inCorso.has(scene.id)) return true;
    inCorso.add(scene.id);

    const suoi = nominati(scene);
    let si = suoi.every((id) => devices.has(id));
    let qualcosa = suoi.length > 0 || vuota(scene);
    for (const step of scene.steps ?? []) {
      if (!si || !step.scene) continue;
      const chiamata = perId.get(step.scene);
      if (!chiamata || !vede(chiamata)) si = false;
      else qualcosa = true;
    }

    inCorso.delete(scene.id);
    const fatto = si && qualcosa;
    esito.set(scene.id, fatto);
    return fatto;
  };

  return new Set(scenes.filter(vede).map((scene) => scene.id));
}

/** Un raggio fatto di elenchi: quello di un ospite. */
function ristretto(parti: {
  maps: Set<string>;
  places: Set<string>;
  agents: Set<string>;
  devices: Set<string>;
  scenes: Set<string>;
}): Raggio {
  return {
    padrone: false,
    ...parti,
    vedeMappa: (id) => parti.maps.has(id),
    vedeLuogo: (id) => parti.places.has(id),
    vedeAgente: (id) => parti.agents.has(id),
    vedeDispositivo: (id) => parti.devices.has(id),
    vedeScena: (id) => parti.scenes.has(id),
  };
}

/**
 * Il raggio di questa richiesta, letto dentro alla transazione di chi lo
 * chiede: quello che si controlla è quello che c'è nello stesso istante in
 * cui si scrive.
 *
 * `scenes` si può passare già lette, anche come sarebbero dopo una modifica:
 * è così che chi salva una scena chiede se la vedrebbe ancora.
 */
export async function raggioDi(tx: Transaction, scope: Scope, scenes?: readonly Scene[]): Promise<Raggio> {
  if (aCasa(scope)) return tutto;

  const maps = new Set((await new MapRepository(tx).findAllIn(scope)).map((map) => map.id));
  const luoghi = await new PlaceRepository(tx).findAllOfMaps([...maps]);
  const places = new Set(luoghi.map((place) => place.id));

  /*
   * Gli agenti dei luoghi che si possono toccare, non di tutti quelli che si
   * guardano: chi ha le chiavi di un pin solo non accende le luci di quello
   * accanto, che vede sulla mappa ma non è suo da cambiare.
   */
  const toccabili = scope.places === null ? luoghi : luoghi.filter((place) => scope.places?.includes(place.id));
  const appesi = new Set(toccabili.flatMap((place) => place.agentIds ?? []));
  const agents = new Set(
    (await new AgentRepository(tx).findAllOf(scope.ownerId)).filter((agent) => appesi.has(agent.id)).map((agent) => agent.id),
  );

  // le telecamere no, come sempre per un ospite: guardare dentro casa d'altri è un'altra cosa
  const devices = new Set(
    (await new DeviceRepository(tx).findAllOf(scope.ownerId))
      .filter((device) => agents.has(device.agentId) && !siGuarda(device.capabilities))
      .map((device) => device.id),
  );

  const tutte = scenes ?? (await new SceneRepository(tx).findAllOf(scope.ownerId));
  return ristretto({ maps, places, agents, devices, scenes: sceneVisibili(tutte, devices) });
}

/**
 * Lo stesso raggio letto da solo, per chi non sta scrivendo niente: il filo
 * aperto di un ospite, che ogni tanto deve sapere di nuovo cosa gli si può
 * mandare.
 */
export function leggiRaggio(scope: Scope): Promise<Raggio> {
  return store.transaction((tx) => raggioDi(tx, scope));
}
