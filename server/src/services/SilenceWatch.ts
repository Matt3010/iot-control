import { hub } from '../iot/hub.js';
import { noticeManager } from '../managers/NoticeManager.js';
import { store } from '../persistence/db.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Agent } from '../types.js';

/**
 * Chi si accorge che un agente ha smesso di parlare.
 *
 * È l'avviso che solo noi possiamo dare. Un impianto in casa può dirti che la
 * porta si è aperta, ma se salta la corrente o cade la linea non c'è più
 * nessuno di là a dirti niente: il silenzio se ne accorge solo chi sta fuori
 * e sta aspettando. Per questo lo fa il server centrale e non l'agente.
 *
 * Non si guarda la connessione ma il tempo: una rete che cade e torna in
 * trenta secondi non è un posto che tace, è una rete. Si aspetta un quarto
 * d'ora prima di dire qualcosa, e chi non si è mai collegato non conta —
 * promettere che qualcosa è caduto quando non si è mai alzato sarebbe una
 * bugia.
 */
const QUIET_MS = Number(process.env.QUIET_MINUTES ?? 15) * 60_000;

/** Ogni quanto si guarda. Un minuto: l'avviso può tardare un minuto. */
const EVERY_MS = 60_000;

/**
 * E quanto si aspetta prima di dirlo di una cosa sola dentro casa.
 *
 * Meno di un agente: se l'agente risponde e una tenda no, il filo verso casa
 * c'e' e il silenzio e' di quella tenda. Ma non zero — una presa che si
 * riavvia sparisce per un minuto e torna, e nessuno vuole saperlo.
 */
const THING_QUIET_MS = Number(process.env.DEVICE_QUIET_MINUTES ?? 10) * 60_000;

/**
 * Da quando tace ognuna delle cose che qualcuno ha chiesto di tenere
 * d'occhio. Sta in memoria e non su disco: se il server riparte si
 * ricomincia a contare, che e' meglio che dire «tace da tre ore» per tre ore
 * in cui non stavamo guardando.
 */
const mute = new Map<string, number>();

function quiet(agent: Agent): boolean {
  if (hub.isOnline(agent.id)) return false;
  if (!agent.lastSeenAt) return false;
  return Date.now() - new Date(agent.lastSeenAt).getTime() > QUIET_MS;
}

/** Quanto tempo e' passato, in parole: «venti minuti», «due ore». */
function howLong(from: string): string {
  const minuti = Math.round((Date.now() - new Date(from).getTime()) / 60_000);
  // «0 minuti» non e' un tempo: e' un numero che non si e' saputo dire
  if (minuti < 1) return 'meno di un minuto';
  if (minuti < 60) return minuti === 1 ? 'un minuto' : `${minuti} minuti`;

  const ore = Math.round(minuti / 60);
  if (ore < 24) return ore === 1 ? "un'ora" : `${ore} ore`;

  const giorni = Math.round(ore / 24);
  return giorni === 1 ? 'un giorno' : `${giorni} giorni`;
}

/**
 * Le cose in casa che qualcuno ha chiesto di tenere d'occhio.
 *
 * Solo quelle: una casa ha venti dispositivi e quasi tutti possono tacere un
 * pomeriggio senza che importi a nessuno. Chi riceve venti avvisi inutili in
 * due giorni li spegne tutti, e quel giorno non gli arriva nemmeno quello del
 * congelatore.
 *
 * E solo mentre il loro agente risponde: se manca lui, di una tenda a trenta
 * chilometri non si sa niente, e lo dice gia' il suo avviso.
 */
async function sweepThings(): Promise<void> {
  const cose = await store.transaction(async (tx) => {
    const guardati = await new DeviceRepository(tx).findWatched();
    const places = new PlaceRepository(tx);

    /*
     * Dove sta ognuno, chiesto una volta per agente.
     *
     * Quattro cose guardate nella stessa casa sono quattro volte lo stesso
     * luogo: la domanda si fa una volta e si tiene da parte, se no ogni giro
     * di minuto ne farebbe quattro uguali.
     */
    const dove = new Map<string, string | undefined>();
    const out: { device: (typeof guardati)[number]; luogo?: string }[] = [];

    for (const device of guardati) {
      if (!dove.has(device.agentId)) {
        dove.set(device.agentId, (await places.findByAgent(device.agentId))?.name);
      }
      const luogo = dove.get(device.agentId);
      out.push({ device, ...(luogo ? { luogo } : {}) });
    }
    return out;
  });

  for (const { device, luogo } of cose) {
    if (!hub.isOnline(device.agentId)) {
      mute.delete(device.id);
      continue;
    }

    const risponde = hub.liveOf(device.agentId, device.externalId)?.online !== false;
    const detto = await noticeManager.lastAboutDevice(device.id);

    if (risponde) {
      mute.delete(device.id);
      if (detto?.kind !== 'silent') continue;

      /*
       * Quanto è durato, come per un agente.
       *
       * «Ha ripreso a rispondere» da solo non dice niente di utile: una cosa
       * tornata dopo due minuti e una tornata dopo due giorni sono due
       * notizie diverse, e di solito quella lunga vuol dire che qualcuno è
       * andato lì a rimetterla a posto. Il conto parte da dove il silenzio
       * era cominciato — per questo l'avviso di prima si porta dietro
       * `since` — e non da quando ce ne siamo accorti: in mezzo ci sono i
       * minuti che si aspettano apposta.
       */
      const muto = howLong(detto.since ?? detto.at);

      await noticeManager.tell(device.ownerId, {
        kind: 'back',
        deviceId: device.id,
        agentId: device.agentId,
        who: device.name,
        ...(luogo ? { where: luogo } : {}),
        short: `ha ripreso a rispondere dopo ${muto}`,
        title: `${device.name} risponde di nuovo`,
        body: `Il dispositivo${luogo ? ` su «${luogo}»` : ''} ha ripreso a rispondere dopo ${muto} di silenzio.`,
      });
      continue;
    }

    // da quanto tace: la prima volta che lo si vede muto si segna l'ora
    const da = mute.get(device.id) ?? Date.now();
    mute.set(device.id, da);

    if (Date.now() - da < THING_QUIET_MS) continue;
    if (detto?.kind === 'silent') continue;

    const quanto = howLong(new Date(da).toISOString());
    await noticeManager.tell(device.ownerId, {
      kind: 'silent',
      deviceId: device.id,
      agentId: device.agentId,
      who: device.name,
      ...(luogo ? { where: luogo } : {}),
      since: new Date(da).toISOString(),
      short: `non risponde da ${quanto}`,
      title: `${device.name} non risponde`,
      body: `Il dispositivo${luogo ? ` su «${luogo}»` : ''} non risponde da ${quanto}, anche se il resto della casa risponde.`,
    });
  }
}

/** Un giro solo. Esportato perche' si possa provare senza aspettare un minuto. */
export async function sweep(): Promise<void> {
  /*
   * Un agente e un luogo non sono la stessa cosa e qui servono tutti e due:
   * quello che tace e' l'agente — e' lui che ha il filo — ma sapere che e'
   * quello di Via Panigale e' l'unica informazione che serve davvero per
   * decidere se alzarsi. Un agente puo' anche non stare su nessun luogo.
   */
  const agents = await store.transaction(async (tx) => {
    const places = new PlaceRepository(tx);
    const out: { agent: Agent; luogo?: string }[] = [];

    for (const agent of await new AgentRepository(tx).findAll()) {
      const luogo = (await places.findByAgent(agent.id))?.name;
      out.push({ agent, ...(luogo ? { luogo } : {}) });
    }
    return out;
  });

  for (const { agent, luogo } of agents) {
    const tace = quiet(agent);
    const detto = await noticeManager.lastAbout(agent.id);

    // Già detto e ancora vero: non si ripete. Un avviso ripetuto ogni minuto
    // è il modo più rapido per far spegnere le notifiche a qualcuno.
    if (tace === (detto?.kind === 'silent')) continue;

    if (tace) {
      const muto = howLong(agent.lastSeenAt as string);
      await noticeManager.tell(agent.ownerId, {
        kind: 'silent',
        agentId: agent.id,
        who: agent.name,
        ...(luogo ? { where: luogo } : {}),
        since: agent.lastSeenAt as string,
        short: `ha smesso di rispondere da ${muto}`,
        title: `${agent.name} non risponde`,
        body: `L'agente ${luogo ? `su «${luogo}» ` : ''}non si fa vivo da ${muto}. Se è saltata la corrente o la linea, di là non c'è più nessuno a dirlo.`,
      });
      continue;
    }

    // Non si dice che un posto risponde di nuovo a chi non ha mai saputo
    // che aveva smesso.
    if (!detto) continue;

    // Quanto e' durato il silenzio si conta da dove era cominciato, non da
    // quando ce ne siamo accorti: in mezzo c'e' il quarto d'ora che si
    // aspetta apposta, e dirlo in meno sarebbe dire una cosa falsa.
    const muto = howLong(detto.since ?? detto.at);

    await noticeManager.tell(agent.ownerId, {
      kind: 'back',
      agentId: agent.id,
      who: agent.name,
      ...(luogo ? { where: luogo } : {}),
      short: `ha ripreso a rispondere dopo ${muto}`,
      title: `${agent.name} risponde di nuovo`,
      body: `L'agente ${luogo ? `su «${luogo}» ` : ''}ha ripreso a farsi vivo dopo ${muto} di silenzio.`,
    });
  }
}

/**
 * Parte con il server e non si ferma più. Il primo giro si fa dopo un minuto
 * e non subito: appena acceso nessun agente si è ancora ricollegato, e
 * sveglierebbe tutti per dire che tace un posto che sta bussando adesso.
 */
export function watchSilence(): void {
  setInterval(() => {
    void sweep().catch((error: Error) => console.warn(`giro degli avvisi, ${error.message}`));
    void sweepThings().catch((error: Error) => console.warn(`giro delle cose, ${error.message}`));
  }, EVERY_MS).unref();
}
