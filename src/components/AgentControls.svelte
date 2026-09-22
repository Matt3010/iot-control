<script lang="ts">
  import type { Snippet } from 'svelte';
  import { devices, type Agent } from '../lib/devices.svelte';
  import DeviceControls from './DeviceControls.svelte';

  /**
   * Un agente e quello che ha sotto di sé, in una card sola — la stessa forma
   * delle mappe: il segno a sinistra, il nome, i comandi a destra, e sotto una
   * fascia con il resto. I dispositivi dentro non sono altre card: sarebbero
   * scatole dentro scatole. Sono righe, divise da un filo.
   *
   *   trail  i comandi a destra del nome: il cestino, quando c'è da eliminare
   *   foot   quello che sta in fondo: il comando da lanciare, i due link
   */
  let {
    agent,
    trail,
    foot,
  }: {
    agent: Agent;
    trail?: Snippet;
    foot?: Snippet;
  } = $props();

  const theirs = $derived(devices.ofAgent(agent.id));
  const tally = $derived(devices.tally(agent.id));

  /**
   * Come sta, con gli stessi quattro colori della pastiglia sul pin — ed è la
   * stessa funzione a deciderlo, se no i due direbbero cose diverse guardando
   * la stessa casa.
   *
   * Verde parla e tutto risponde. Arancione parla ma qualcosa là dentro no:
   * era il caso che mancava, e un pallino verde sopra a un dispositivo rosso
   * è una bugia. Rosso parlava e non parla più. Grigio non ha mai parlato,
   * che non è un guasto — è da installare.
   */
  const health = $derived(devices.health([agent.id]) ?? 'new');

  /** Il colore da solo non basta a chi non lo distingue: la parola sta qui. */
  const says = $derived(
    health === 'live'
      ? 'Collegato'
      : health === 'degraded'
        ? 'Collegato, ma qualcosa non risponde'
        : health === 'lost'
          ? 'Non collegato'
          : 'Mai collegato',
  );
</script>

<div class="agent">
  <div class="head">
    <span class="mark {health}" title={says} role="img" aria-label={says}></span>
    <span class="who">{agent.name}</span>
    <!-- quando non è collegato non si scrive niente: lo dice il pallino, e
         ripeterlo a parole è rumore -->
    <!-- Quando è tutto spento non si scrive niente: lo dicono già i pallini
         qui sotto, che restano grigi. Si scrive solo quando c'è qualcosa
         acceso — o quando non c'è proprio niente da accendere. -->
    {#if agent.online && (!tally.total || tally.on)}
      <span class="how">
        {#if !tally.total}
          nessun comando
        {:else}
          {tally.on} di {tally.total} acces{tally.on === 1 ? 'o' : 'i'}
        {/if}
      </span>
    {/if}
    {#if trail}<span class="trail">{@render trail()}</span>{/if}
  </div>

  {#if theirs.length}
    <div class="list">
      {#each theirs as device (device.id)}
        <DeviceControls {device} />
      {/each}
    </div>
  {:else}
    <p class="empty">
      {agent.online
        ? 'Collegato, ma non ha ancora raccontato nessun dispositivo.'
        : 'Appena si collega, quello che trova compare qui.'}
    </p>
  {/if}

  {#if foot}
    <div class="foot">{@render foot()}</div>
  {/if}
</div>

<style>
  /* la card: stessa pasta delle righe del pannello, e overflow nascosto
     perché le righe dentro si tingono fino al bordo */
  .agent {
    border-radius: var(--r-md);
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
    overflow: hidden;
  }

  /* testata --------------------------------------------------------------- */

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 6px 9px 12px;
    min-width: 0;
  }

  .mark {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background 0.22s, box-shadow 0.22s;
  }

  /* mai collegato: non è un guasto, è uno che deve ancora essere installato */
  .mark.new {
    background: var(--ink-3);
    box-shadow: inset 0 0 0 1px var(--hairline);
  }

  .mark.live { background: #2f9e5e; box-shadow: 0 0 0 3px rgb(47 158 94 / 0.16); }

  /* parla, ma non tutto quello che ha sotto risponde */
  .mark.degraded { background: #d98613; box-shadow: 0 0 0 3px rgb(217 134 19 / 0.18); }

  /* parlava e non parla più: quello sì che è successo qualcosa */
  .mark.lost {
    background: var(--danger);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 18%, transparent);
  }

  .who {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 560;
    letter-spacing: -0.012em;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .how {
    flex: none;
    font-size: 11px;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .trail { display: flex; align-items: center; flex: none; }

  /* i dispositivi --------------------------------------------------------- */

  /* con più di due o tre l'elenco scorre, invece di allungare la scheda fino
     a mangiarsi la mappa */
  .list {
    max-height: 300px;
    overflow: auto;
    overscroll-behavior: contain;
    border-top: 1px solid var(--hairline-soft);
  }


  .empty {
    margin: 0;
    padding: 0 12px 11px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-3);
  }

  /* la fascia in fondo ---------------------------------------------------- */

  .foot {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 10px 12px 11px;
    border-top: 1px solid var(--hairline-soft);
  }
</style>
