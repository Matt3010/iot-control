<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import Popover from './Popover.svelte';

  /**
   * Scegliere una voce da un elenco corto, accanto al tasto che l'ha chiesto.
   *
   * È il fratello della domanda di conferma: stessa pasta, stesso posto, ma
   * invece di sì o no ci sono dei nomi. Serve dove la scelta è fra cose che
   * l'utente ha creato — su quale luogo mettere un agente — e dove un
   * selettore a tendina sarebbe un pezzo di modulo in mezzo a una scheda.
   */
  const request = $derived(ui.pick!);

  function choose(id: string): void {
    const pick = request.onPick;
    ui.pick = null;
    pick(id);
  }
</script>

<Popover
  anchor={request.anchor}
  width={240}
  height={300}
  place="beside"
  id="pick-popover"
  onclose={() => (ui.pick = null)}
>
  <p class="what">{request.title}</p>

  <div class="list">
    {#each request.options as option (option.id)}
      <button
        type="button"
        class="one"
        class:is-on={option.id === request.current}
        onclick={() => choose(option.id)}
      >
        <span class="name">{option.label}</span>
        {#if option.note}<span class="note">{option.note}</span>{/if}
      </button>
    {/each}
  </div>
</Popover>

<style>
  :global(#pick-popover) { padding: 9px; display: grid; gap: 7px; }

  .what {
    margin: 0 2px;
    font-size: 12px;
    font-weight: 560;
    letter-spacing: -0.008em;
    color: var(--ink);
  }

  /* un elenco che scorre, non una finestra che cresce: i luoghi di una mappa
     possono essere venti, e un popover alto quanto lo schermo non si chiude */
  .list {
    display: grid;
    gap: 1px;
    max-height: 244px;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .one {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s, color 0.14s;
  }

  .one:hover { background: var(--sunken); color: var(--ink); }

  /* quella di adesso resta segnata: scegliere di nuovo la stessa non è un
     errore, ma sapere qual è evita di cercarla */
  .one.is-on { background: var(--sunken); color: var(--ink); font-weight: 560; }

  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .note { flex: none; font-size: 11px; color: var(--ink-3); }
</style>
