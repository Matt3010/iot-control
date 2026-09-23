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

/** Da quanto tace, in parole: «da venti minuti», «da due ore». */
function since(at: string): string {
  const minuti = Math.round((Date.now() - new Date(at).getTime()) / 60_000);
  if (minuti < 60) return `da ${minuti} minuti`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return ore === 1 ? "da un'ora" : `da ${ore} ore`;
  const giorni = Math.round(ore / 24);
  return giorni === 1 ? 'da un giorno' : `da ${giorni} giorni`;
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
      await noticeManager.tell(agent.ownerId, {
        kind: 'silent',
        agentId: agent.id,
        who: agent.name,
        short: `non risponde ${since(agent.lastSeenAt as string)}`,
        title: `${agent.name} non risponde`,
        body: `Quel posto non si fa vivo ${since(agent.lastSeenAt as string)}. Se è saltata la corrente o la linea, di là non c'è più nessuno a dirlo.`,
      });
      continue;
    }

    // Non si dice «è tornato» a chi non ha mai saputo che era andato via.
    if (!detto) continue;

    await noticeManager.tell(agent.ownerId, {
      kind: 'back',
      agentId: agent.id,
      who: agent.name,
      short: 'è tornato',
      title: `${agent.name} è tornato`,
      body: 'Quel posto si è ricollegato: da qui si vede di nuovo quello che c\u2019è dentro.',
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
