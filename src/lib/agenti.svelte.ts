import { devices, type Agent } from './devices.svelte';
import { store } from './store.svelte';
import { toast } from './toast.svelte';
import { ui } from './ui.svelte';

/*
 * Quello che si fa a un agente, detto una volta sola.
 *
 * La pagina degli agenti e la scheda di un luogo avevano ognuna la sua copia
 * di tutto: creare, rigenerare il token, cosa porta via eliminarlo, e le tre
 * domande prima di farlo. Due copie di una domanda prima o poi dicono due
 * cose diverse sulla stessa macchina.
 */

/** Su quale luogo sta un agente, se ce l'ha: è la domanda che viene subito. */
export const placeOf = (agent: Agent) =>
  store.places.find((place) => (place.agentIds ?? []).includes(agent.id));

/**
 * Il comando da lanciare su quella macchina, per l'ultimo agente creato o
 * rigenerato. Si vede una volta sola, perché dentro c'è il token e del token
 * qui resta solo un'impronta: vive nella schermata che l'ha chiesto, e se ne
 * va con lei.
 */
export class Installazione {
  fresh = $state<{ id: string; install: string } | null>(null);

  /** Torna l'agente nato, o niente se il server ha detto di no (e allora lo dice). */
  async create(name: string): Promise<Agent | null> {
    try {
      const made = await devices.createAgent(name);
      this.fresh = { id: made.agent.id, install: made.install };
      return made.agent;
    } catch (error) {
      toast.show((error as Error).message);
      return null;
    }
  }

  async rotate(agent: Agent): Promise<void> {
    try {
      this.fresh = { id: agent.id, install: (await devices.newToken(agent)).install };
      toast.show("Token nuovo. L'agente va reinstallato con questo comando.");
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  /** Il comando di un agente che se ne va da qui non serve più a niente. */
  forget(agentId: string): void {
    if (this.fresh?.id === agentId) this.fresh = null;
  }
}

/** Cosa porta via eliminarlo: i suoi dispositivi. Il luogo resta un luogo. */
export function takesAway(agent: Agent): string {
  const count = devices.ofAgent(agent.id).length;
  const where = placeOf(agent);
  const devs = count
    ? `Se ne ${count === 1 ? 'va' : 'vanno'} ${count} dispositiv${count === 1 ? 'o' : 'i'}.`
    : 'Non ha ancora raccontato nessun dispositivo.';
  return where ? `${devs} Il luogo «${where.name}» resta dov'è.` : devs;
}

/** Prima di rigenerare: quella macchina resta scollegata finché non la reinstalli. */
export function chiediRigenera(anchor: HTMLElement, onYes: () => void): void {
  ui.askSure(anchor, {
    title: 'Rigenerare il token?',
    detail:
      'Quello di adesso smette di funzionare subito, e quella macchina resta scollegata finché non la reinstalli con il comando nuovo.',
    verb: 'Rigenera',
    tone: 'plain',
    no: 'Annulla',
    onYes,
  });
}

/**
 * Prima di staccarlo da un luogo. `dove` è il nome del luogo quando lo si
 * guarda da fuori; dalla scheda del luogo stesso è «questo».
 */
export function chiediStacca(anchor: HTMLElement, dove: string | null, onYes: () => void): void {
  ui.askSure(anchor, {
    title: dove ? `Staccarlo da “${dove}”?` : 'Staccarlo da questo luogo?',
    detail: `L'agente resta e continua a funzionare. ${dove ? 'Quel' : 'Questo'} luogo smette solo di mostrarlo, e lo puoi rimettere ${dove ? 'lì' : 'qui'} o altrove.`,
    verb: 'Stacca',
    tone: 'plain',
    no: 'Annulla',
    onYes,
  });
}

/** Prima di eliminarlo, con quello che si porta via. */
export function chiediElimina(anchor: HTMLElement, agent: Agent, onYes: () => void): void {
  ui.askSure(anchor, {
    title: `Eliminare “${agent.name}”?`,
    detail: takesAway(agent),
    verb: 'Elimina',
    onYes,
  });
}
