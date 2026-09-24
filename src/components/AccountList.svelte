<script lang="ts">
  import type { Agent } from '../lib/devices.svelte';
  import type { Provider } from '../lib/providers';
  import type { Health, LinkedAccount } from '../lib/types';
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
    accounts: readonly Provider[];
    linked: LinkedAccount[];
    busy: boolean;
    onbegin: (account: Provider) => void;
    onoff: (joint: LinkedAccount, label: string) => void;
  } = $props();

  const joined = (handler: string) => linked.filter((one) => one.handler === handler);

  /** Il colore da solo non basta a chi non lo distingue: la parola sta qui. */
  const says = (health: Health | undefined): string =>
    health === 'live'
      ? 'Collegato'
      : health === 'degraded'
        ? 'Collegato, ma ci sta riprovando'
        : health === 'lost'
          ? 'Non riesce a collegarsi'
          : health === 'new'
            ? 'Spento'
            : 'Non collegato';

  /** Niente parte prima di un sì: collegare un account non è un clic qualunque. */
  function ask(event: MouseEvent, account: Provider) {
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
{#snippet segno(label: string, as: string, health: Health | undefined)}
  <!-- Lo stesso pallino dell'agente, con lo stesso significato: verde parla e
       risponde, arancione ci sta riprovando, rosso non ce la fa, grigio non
       c'è. Un verde che resta verde mentre l'account è scaduto è una bugia
       che si guarda tutti i giorni. -->
  <span class="mark {health ?? 'none'}" title={says(health)} role="img" aria-label={says(health)}></span>
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
        {@render segno(account.label, joint.title, joint.health ?? 'live')}

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
        {@render segno(mine.length ? account.more : account.label, '', undefined)}

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

  /* come sta, si vede dal pallino prima ancora di leggere */
  .mark {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
    opacity: 0.5;
  }

  /* collegato e funzionante */
  .mark.live { background: var(--ok); opacity: 1; }

  /* collegato, ma ci sta riprovando: c'è, e non porta */
  .mark.degraded { background: var(--warn); opacity: 1; }

  /* c'era e non ce la fa più: un account scaduto, una password cambiata */
  .mark.lost { background: var(--danger); opacity: 1; }

  /* spento di là: non è un guasto, è una cosa da riaccendere */
  .mark.new { background: var(--ink-3); opacity: 1; }

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
