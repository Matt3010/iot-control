<script lang="ts">
  import { nextDays, saysDay } from '../lib/timing';
  import Icon from './Icon.svelte';
  import Popover from './Popover.svelte';

  /**
   * Un giorno, scelto da un elenco corto.
   *
   * Non è un calendario e non vuole esserlo: qui si sceglie quando far
   * partire una scena una volta sola — la sera che parti, il giorno che
   * arriva qualcuno — e sono cose che stanno nelle prossime settimane. Un
   * mese da sfogliare, con le frecce avanti e indietro, per scegliere
   * «domani» è più lavoro di quanto ne risparmi.
   *
   * Le prime righe si leggono come si direbbero: oggi, domani, dopodomani.
   */
  let {
    value,
    onchange,
    label = 'In che giorno',
  }: {
    /** Come lo scrive un calendario: `2026-09-25`. */
    value: string;
    onchange: (next: string) => void;
    label?: string;
  } = $props();

  const GIORNI = nextDays(30);

  let open = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);

  function choose(day: string): void {
    open = false;
    onchange(day);
  }

  /** Quello scelto si porta sotto gli occhi appena si apre. */
  function reveal(node: HTMLElement): void {
    node.querySelector('.is-on')?.scrollIntoView({ block: 'center' });
  }
</script>

<button
  type="button"
  class="day-btn"
  class:is-open={open}
  aria-label={label}
  aria-expanded={open}
  bind:this={anchor}
  onclick={() => (open = !open)}
>
  <span class="letto">{saysDay(value)}</span>
  <Icon name="expand" />
</button>

{#if open && anchor}
  <Popover {anchor} width={210} height={248} id="day-pop" onclose={() => (open = false)}>
    <div class="elenco" use:reveal>
      {#each GIORNI as day (day)}
        <button type="button" class="voce" class:is-on={day === value} onclick={() => choose(day)}>
          {saysDay(day)}
        </button>
      {/each}
    </div>
  </Popover>
{/if}

<style>
  .day-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    background: var(--sunken);
    color: var(--ink);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    transition: background 0.14s, border-color 0.14s;
  }

  .day-btn:hover, .day-btn.is-open {
    background: var(--sunken-hover);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .day-btn :global(.ico) { width: 12px; height: 12px; color: var(--ink-3); }

  :global(#day-pop) { padding: 8px; }

  .elenco {
    display: grid;
    gap: 1px;
    max-height: 232px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .elenco::-webkit-scrollbar { display: none; }

  .voce {
    padding: 7px 9px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .voce:hover { background: var(--sunken); color: var(--ink); }

  .voce.is-on {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--ink);
    font-weight: 560;
  }
</style>
