import type { LinkedAccount } from '../../../shared/protocol.js';
import { hub } from '../iot/hub.js';
import { noticeManager } from '../managers/NoticeManager.js';
import type { Agent } from '../types.js';

/**
 * Gli account collegati agli agenti, e quando smettono di funzionare.
 *
 * Un account scade quando cambia la password o il servizio revoca
 * l'accesso, e da lì i suoi dispositivi tacciono senza un perché visibile.
 * L'agente racconta come stanno ogni pochi minuti; qui si guarda cosa è
 * cambiato dall'ultima volta, e se un account è appena andato giù si avvisa,
 * una volta sola.
 *
 * La memoria è in questo processo. Dopo un riavvio del server il primo
 * racconto fa da punto di partenza e non avvisa: quello che era già giù è
 * già stato detto, prima.
 */
const visti = new Map<string, Map<string, LinkedAccount>>();

/** Un agente che se ne va non ha più account da ricordare. */
export function dimentica(agentId: string): void {
  visti.delete(agentId);
}

const giu = (account: LinkedAccount | undefined): boolean => account?.health === 'lost' || !!account?.ricollega;

export async function accountsReported(agent: Agent, accounts: LinkedAccount[]): Promise<void> {
  const prima = visti.get(agent.id);
  visti.set(agent.id, new Map(accounts.map((one) => [one.entryId, one])));

  // chi ha la scheda aperta rilegge, se qualcosa è cambiato
  const firma = (elenco: Iterable<LinkedAccount>) =>
    JSON.stringify([...elenco].map((one) => [one.entryId, one.health, one.ricollega ?? '']).sort());
  if (!prima || firma(prima.values()) !== firma(accounts)) hub.changed(agent.ownerId, { kind: 'accounts', agentId: agent.id });
  if (!prima) return;

  for (const account of accounts) {
    if (!giu(account) || giu(prima.get(account.entryId))) continue;
    const nome = account.name ?? account.handler;
    await noticeManager.tell(agent.ownerId, {
      kind: 'account',
      agentId: agent.id,
      who: nome,
      short: account.ricollega ? 'va ricollegato' : 'non riesce a collegarsi',
      title: account.ricollega
        ? `L’account ${nome} di «${agent.name}» va ricollegato`
        : `L’account ${nome} di «${agent.name}» non riesce a collegarsi`,
      body: account.ricollega
        ? 'Le credenziali non valgono più, forse per una password cambiata. Nella scheda dell’agente premi «Ricollega». Dispositivi, scene e avvisi restano come sono.'
        : 'Il servizio non risponde da quella casa. Di solito torna da solo, e se non torna va scollegato e ricollegato dalla scheda dell’agente.',
    });
  }
}
