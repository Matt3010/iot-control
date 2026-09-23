import { hub } from '../iot/hub.js';
import { noticeManager } from '../managers/NoticeManager.js';
import { store } from '../persistence/JsonStore.js';
import type { Agent } from '../types.js';

/**
 * Chi si accorge che un posto ha smesso di parlare.
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

function quiet(agent: Agent): boolean {
  if (hub.isOnline(agent.id)) return false;
  if (!agent.lastSeenAt) return false;
  return Date.now() - new Date(agent.lastSeenAt).getTime() > QUIET_MS;
}

/** Quanto tempo e' passato, in parole: «venti minuti», «due ore». */
function howLong(from: string): string {
  const minuti = Math.round((Date.now() - new Date(from).getTime()) / 60_000);
  if (minuti < 60) return minuti === 1 ? 'un minuto' : `${minuti} minuti`;

  const ore = Math.round(minuti / 60);
  if (ore < 24) return ore === 1 ? "un'ora" : `${ore} ore`;

  const giorni = Math.round(ore / 24);
  return giorni === 1 ? 'un giorno' : `${giorni} giorni`;
}

/** Un giro solo. Esportato perche' si possa provare senza aspettare un minuto. */
export async function sweep(): Promise<void> {
  const agents = await store.transaction((tx) => tx.data.agents.slice());

  for (const agent of agents) {
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
        since: agent.lastSeenAt as string,
        short: `ha smesso di rispondere da ${muto}`,
        title: `${agent.name} non risponde`,
        body: `Quel posto non si fa vivo da ${muto}. Se è saltata la corrente o la linea, di là non c'è più nessuno a dirlo.`,
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
      short: `ha ripreso a rispondere dopo ${muto}`,
      title: `${agent.name} risponde di nuovo`,
      body: `Ha ripreso a farsi vivo dopo ${muto} di silenzio: da qui si vede di nuovo quello che c’è dentro.`,
    });
  }
}

/**
 * Parte con il server e non si ferma più. Il primo giro si fa dopo un minuto
 * e non subito: appena acceso nessun agente si è ancora ricollegato, e
 * sveglierebbe tutti per dire che tace un posto che sta bussando adesso.
 */
export function watchSilence(): void {
  setInterval(() => void sweep().catch((error: Error) => console.warn(`giro degli avvisi: ${error.message}`)), EVERY_MS).unref();
}
