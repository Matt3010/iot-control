<script lang="ts">
  import type { Agent } from '../lib/devices.svelte';
  import type { Account, LinkedAccount } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';

  /**
   * Cosa è collegato a un agente, e cosa si può collegare.
   *
   * Una riga per ogni collegamento, non per marca: di account ce n'è uno solo
   * — quello con cui sei entrato — ma di telecamere ce n'è una per canale, e
   * staccarne una non deve staccare le altre.
   *
   * Qui non si collega niente: si chiede il permesso e si passa la parola.
   * Cosa comporta collegare una marca lo dice l'avviso prima del sì, che non
   * è un dettaglio — certe cose scaricano roba su quella macchina e la fanno
   * riavviare, e chi preme deve saperlo prima, non dopo.
   */

  let {
    agent,
    accounts,
    linked,
    busy,
    onbegin,
    onoff,
  }: {
    agent: Agent;
    accounts: readonly Account[];
    linked: LinkedAccount[];
    busy: boolean;
    onbegin: (account: Account) => void;
    onoff: (joint: LinkedAccount, label: string) => void;
  } = $props();

  const joined = (handler: string) => linked.filter((one) => one.handler === handler);

  /** Niente parte prima di un sì: collegare un account non è un clic qualunque. */
  function ask(event: MouseEvent, account: Account) {
    ui.askSure(event.currentTarget as HTMLElement, {
      title: `Collegare ${account.label}?`,
      detail: account.warns,
      verb: 'Collega',
      tone: 'plain',
      no: 'Non ora',
      onYes: () => onbegin(account),
    });
  }
</script>

<!--
  Il pallino e il nome: uguali per una riga collegata e per una da collegare,
  e scritti una volta sola. Due copie della stessa riga diventano due righe
  diverse alla prima correzione fatta di fretta su una sola.
-->
{#snippet segno(label: string, as: string)}
  <span class="mark" aria-hidden="true"></span>
  <span class="who">
    <b>{label}</b>
    {#if as}<span class="as">{as}</span>{/if}
  </span>
{/snippet}

<div class="accounts">
  {#each accounts as account (account.handler)}
    {@const mine = joined(account.handler)}

    {#each mine as joint (joint.entryId)}
      <div class="account is-joined">
        {@render segno(account.label, joint.title)}

        <Button
          look="link"
          tone="danger"
          extra="kill"
          disabled={busy}
          onclick={(event: MouseEvent) =>
            ui.askSure(event.currentTarget as HTMLElement, {
              title: account.many ? `Scollegare «${joint.title}»?` : `Scollegare ${account.label}?`,
              detail: "L'agente si porta via i suoi dispositivi. Il collegamento si rifà quando vuoi.",
              verb: 'Scollega',
              onYes: () => onoff(joint, account.many ? joint.title : account.label),
            })}
        >
          Scollega
        </Button>
      </div>
    {/each}

    <!-- E la riga per aggiungerne: sempre, dove se ne può avere più d'una. -->
    {#if !mine.length || account.many}
      <div class="account">
        {@render segno(mine.length ? account.more : account.label, '')}

        <!-- stessa misura di «Scollega»: in questo elenco ogni azione è un
             comando scritto piccolo, e due misure diverse sulla stessa
             colonna si vedono -->
        <Button
          look="link"
          disabled={!agent.online || busy}
          title={agent.online ? `Collega ${account.label}` : "L'agente non è collegato"}
          onclick={(event: MouseEvent) => ask(event, account)}
        >
          Collega
        </Button>
      </div>
    {/if}
  {/each}
</div>

<style>
  .accounts { display: grid; gap: 4px; }

  .account {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* collegato o no, si vede dal pallino prima ancora di leggere */
  .mark {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
    opacity: 0.5;
  }

  .account.is-joined .mark { background: #2f9e5e; opacity: 1; }

  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11.5px;
    color: var(--ink-3);
    overflow: hidden;
  }

  .who b { font-weight: 560; color: var(--ink-2); }

  .account.is-joined .who b { color: var(--ink); }

  /* con che utente sei entrato, o da che canale guarda: serve a sapere se è
     quello giusto prima di staccarlo */
  .as {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
