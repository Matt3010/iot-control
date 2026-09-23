<script lang="ts">
  import { alerts } from '../lib/alerts.svelte';
  import Icon from './Icon.svelte';

  /**
   * Gli avvisi avvenuti, dal più recente.
   *
   * La riga dice anche se è arrivata davvero, e non per pignoleria: una
   * notifica può essere respinta — telefono spento, senza rete, notifiche
   * negate — e questa pagina è l'unico posto dove uno che non è arrivato
   * esiste lo stesso. «Te l'avevo detto» vale solo se si vede dove.
   */
  $effect(() => {
    void alerts.load();
  });

  /** Che ora era. Oggi basta l'ora; prima serve dire anche il giorno. */
  function when(at: string): string {
    const then = new Date(at);
    const ore = then.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });
    const oggi = new Date().toDateString() === then.toDateString();
    if (oggi) return ore;

    const ieri = new Date();
    ieri.setDate(ieri.getDate() - 1);
    if (ieri.toDateString() === then.toDateString()) return `ieri ${ore}`;

    return `${then.toLocaleDateString('it', { day: 'numeric', month: 'short' })} ${ore}`;
  }

  /** Com'è andata la consegna. Detto solo quando c'è qualcosa da dire. */
  function delivery(sent: number, failed: number): string {
    if (failed && !sent) return 'non consegnato';
    if (failed) return `consegnato a ${sent}, respinto da ${failed}`;
    if (!sent) return 'nessuna macchina iscritta';
    return '';
  }
</script>

<div class="avvenuti">
  <span class="eyebrow">Ultimi avvisi</span>

  {#if !alerts.loaded}
    <!-- prima di sapere non si dice niente: «non è successo niente» detto
         mentre si sta ancora chiedendo è una bugia che dura un secondo -->
    <p class="say quiet">Un momento…</p>
  {:else if !alerts.rows.length}
    <p class="say quiet">
      Non è ancora successo niente. Quando un posto smetterà di rispondere lo troverai scritto qui,
      anche se la notifica non fosse arrivata.
    </p>
  {:else}
    <ul>
      {#each alerts.rows as row (row.id)}
        {@const male = delivery(row.sent, row.failed)}
        <li>
          <span class="segno" class:is-back={row.kind === 'back'}>
            <Icon name={row.kind === 'back' ? 'check' : 'alert'} />
          </span>

          <div class="detto">
            <p class="title">{row.title}</p>
            <p class="body">{row.body}</p>
            <!-- la consegna mancata va sotto le parole e non accanto all'ora:
                 è una frase, e in colonna stretta si spezzava in tre righe
                 rubando metà riga a quello che l'avviso diceva -->
            {#if male}<p class="male">{male}</p>{/if}
          </div>

          <time datetime={row.at}>{when(row.at)}</time>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .avvenuti { display: grid; gap: 9px; min-width: 0; }

  .say { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-2); }

  .quiet { color: var(--ink-3); }

  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }

  li {
    display: grid;
    /* segno, quello che dice, quando: il tempo a destra si legge in colonna */
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: 9px;
    padding: 8px 2px;
    border-top: 1px solid var(--hairline-soft);
  }

  li:first-child { border-top: 0; }

  .segno {
    display: inline-flex;
    margin-top: 1px;
    color: var(--warn);
  }

  /* il ritorno non è un allarme: stesso posto, colore diverso */
  .segno.is-back { color: var(--ok); }

  .segno :global(.ico) { width: 14px; height: 14px; }

  .detto { min-width: 0; display: grid; gap: 2px; }

  .title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 560;
    letter-spacing: -0.008em;
    color: var(--ink);
  }

  .body { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

  time {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .male { margin: 0; font-size: 11px; color: var(--warn); }
</style>
