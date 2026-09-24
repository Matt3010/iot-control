import { hub } from '../iot/hub.js';
import { noticeManager, scrivi, type Detto } from '../managers/NoticeManager.js';
import { store, type Transaction } from '../persistence/db.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
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

/**
 * Un avviso di silenzio o di ripresa, detto una volta sola.
 *
 * Prima si prende il turno (`prendi`, che torna da quando o niente se l'ha
 * preso un altro), poi nella stessa transazione si scrive la riga
 * dell'avviso, così preso l'uno c'è anche l'altra; e solo dopo si consegna.
 * Era scritto quattro volte, per agenti e dispositivi che tacciono o
 * riprendono.
 */
async function diUnaVolta(
  ownerId: string,
  prendi: (tx: Transaction) => Promise<string | null>,
  avviso: (da: string) => Detto,
): Promise<void> {
  const riga = await store.transaction(async (tx) => {
    const da = await prendi(tx);
    return da ? scrivi(tx, ownerId, avviso(da)) : undefined;
  });
  if (riga) await noticeManager.manda(riga);
}

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
export async function sweepThings(): Promise<void> {
  // le cose guardate e il luogo dove stanno, in una domanda sola
  const cose = await store.transaction((tx) => new DeviceRepository(tx).findWatchedWithPlace());

  // chi non è più guardato, o non c'è più, non ha un silenzio da contare
  const guardate = new Set(cose.map(({ device }) => device.id));
  for (const id of mute.keys()) if (!guardate.has(id)) mute.delete(id);

  for (const { device, luogo } of cose) {
    if (!hub.isOnline(device.agentId)) {
      mute.delete(device.id);
      continue;
    }

    const risponde = hub.liveOf(device.agentId, device.externalId)?.online !== false;

    if (risponde) {
      mute.delete(device.id);
      // Si sa già dalla riga letta se c'era un silenzio detto: chi non l'aveva, non ha niente da dire.
      if (!device.quietSince) continue;

      /*
       * Il turno di dirlo: lo prende chi riesce a togliere il silenzio, e
       * torna da quando era cominciato. Due giri accavallati non lo dicono
       * due volte.
       *
       * Quanto è durato, come per un agente. «Ha ripreso a rispondere» da
       * solo non dice niente di utile: una cosa tornata dopo due minuti e
       * una tornata dopo due giorni sono due notizie diverse. Il conto parte
       * da dove il silenzio era cominciato e non da quando ce ne siamo
       * accorti: in mezzo ci sono i minuti che si aspettano apposta.
       */
      await diUnaVolta(
        device.ownerId,
        (tx) => new DeviceRepository(tx).claimBack(device.id),
        (da) => {
          const muto = howLong(da);
          return {
            kind: 'back',
            deviceId: device.id,
            agentId: device.agentId,
            who: device.name,
            ...(luogo ? { where: luogo } : {}),
            short: `ha ripreso a rispondere dopo ${muto}`,
            title: `${device.name} risponde di nuovo`,
            body: `Il dispositivo${luogo ? ` su «${luogo}»` : ''} ha ripreso a rispondere dopo ${muto} di silenzio.`,
          };
        },
      );
      continue;
    }

    // da quanto tace: la prima volta che lo si vede muto si segna l'ora
    const da = mute.get(device.id) ?? Date.now();
    mute.set(device.id, da);

    if (Date.now() - da < THING_QUIET_MS) continue;
    if (device.quietSince) continue;

    const since = new Date(da).toISOString();
    await diUnaVolta(
      device.ownerId,
      (tx) => new DeviceRepository(tx).claimQuiet(device.id, since),
      (dal) => {
        const quanto = howLong(dal);
        return {
          kind: 'silent',
          deviceId: device.id,
          agentId: device.agentId,
          who: device.name,
          ...(luogo ? { where: luogo } : {}),
          since: dal,
          short: `non risponde da ${quanto}`,
          title: `${device.name} non risponde`,
          body: `Il dispositivo${luogo ? ` su «${luogo}»` : ''} non risponde da ${quanto}, anche se il resto della casa risponde.`,
        };
      },
    );
  }
}

/** Un giro solo. Esportato perche' si possa provare senza aspettare un minuto. */
export async function sweep(): Promise<void> {
  /*
   * Un agente e un luogo non sono la stessa cosa e qui servono tutti e due:
   * quello che tace e' l'agente — e' lui che ha il filo — ma sapere che e'
   * quello di Via Panigale e' l'unica informazione che serve davvero per
   * decidere se alzarsi. Un agente puo' anche non stare su nessun luogo.
   *
   * Se il silenzio è già stato detto lo sa la riga dell'agente
   * (`quietSince`), letta qui con tutto il resto: niente domande in più per
   * ogni casa, ogni minuto.
   */
  const agents = await store.transaction((tx) => new AgentRepository(tx).findAllWithPlace());

  for (const { agent, luogo } of agents) {
    const tace = quiet(agent);

    // Già detto e ancora vero: non si ripete. Un avviso ripetuto ogni minuto
    // è il modo più rapido per far spegnere le notifiche a qualcuno.
    if (tace === !!agent.quietSince) continue;

    if (tace) {
      const since = agent.lastSeenAt as string;
      // il turno di dirlo: chi arriva secondo trova il posto già preso
      await diUnaVolta(
        agent.ownerId,
        (tx) => new AgentRepository(tx).claimQuiet(agent.id, since),
        (dal) => {
          const muto = howLong(dal);
          return {
            kind: 'silent',
            agentId: agent.id,
            who: agent.name,
            ...(luogo ? { where: luogo } : {}),
            since: dal,
            short: `ha smesso di rispondere da ${muto}`,
            title: `${agent.name} non risponde`,
            body: `L'agente ${luogo ? `su «${luogo}» ` : ''}non si fa vivo da ${muto}. Se è saltata la corrente o la linea, di là non c'è più nessuno a dirlo.`,
          };
        },
      );
      continue;
    }

    // Quanto e' durato il silenzio si conta da dove era cominciato, non da
    // quando ce ne siamo accorti: in mezzo c'e' il quarto d'ora che si
    // aspetta apposta, e dirlo in meno sarebbe dire una cosa falsa.
    await diUnaVolta(
      agent.ownerId,
      (tx) => new AgentRepository(tx).claimBack(agent.id),
      (da) => {
        const muto = howLong(da);
        return {
          kind: 'back',
          agentId: agent.id,
          who: agent.name,
          ...(luogo ? { where: luogo } : {}),
          short: `ha ripreso a rispondere dopo ${muto}`,
          title: `${agent.name} risponde di nuovo`,
          body: `L'agente ${luogo ? `su «${luogo}» ` : ''}ha ripreso a farsi vivo dopo ${muto} di silenzio.`,
        };
      },
    );
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
