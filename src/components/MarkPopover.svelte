<script lang="ts">
  import { createElement } from 'lucide';
  import { MARKS, marksLike } from '../lib/marks';
  import { placeBeside } from '../lib/popover';
  import { ui } from '../lib/ui.svelte';

  /**
   * Scegliere il segno di una categoria.
   *
   * Una cinquantina di disegni, non un catalogo: un elenco di mille voci non
   * si sfoglia, si subisce. Si cercano per nome in italiano — chi scrive
   * «mangiare» deve trovare il coltello e la forchetta, e chi scrive «birra»
   * il boccale.
   *
   * Prende il posto del selettore di emoji, che si portava dietro 440KB di
   * dati per far scegliere una faccina che poi ognuno vedeva disegnata dal
   * proprio telefono.
   */
  const request = $derived(ui.mark!);
  const at = $derived(placeBeside(request.anchor, 296, 320));

  let query = $state('');
  const shown = $derived(marksLike(query));

  /** Il disegno, come stringa: qui ne servono cinquanta in una volta. */
  const drawn = (icon: (typeof MARKS)[number]['icon']): string => {
    const svg = createElement(icon);
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    return svg.outerHTML;
  };

  function choose(key: string): void {
    const pick = request.onPick;
    ui.mark = null;
    pick(key);
  }
</script>

<div id="mark-popover" class="surface" style:left="{at.left}px" style:top="{at.top}px">
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="mark-search"
    type="text"
    autofocus
    placeholder="Cerca fra casa, mangiare, treno…"
    bind:value={query}
    onkeydown={(event) => {
      // invio prende il primo: con la ricerca in mano è il gesto naturale
      if (event.key === 'Enter' && shown[0]) choose(shown[0].key);
    }}
  />

  {#if shown.length}
    <div class="marks">
      {#each shown as mark (mark.key)}
        <button
          type="button"
          class="mark-pick"
          class:is-on={mark.key === request.current}
          title={mark.label}
          aria-label={mark.label}
          onclick={() => choose(mark.key)}
        >
          {@html drawn(mark.icon)}
        </button>
      {/each}
    </div>
  {:else}
    <p class="none">Nessun segno con questo nome. Prova con una parola più corta.</p>
  {/if}
</div>

<style>
  #mark-popover {
    position: fixed;
    z-index: var(--z-popover);
    width: 296px;
    padding: 10px;
    display: grid;
    gap: 9px;
    animation: rise 0.16s var(--ease);
  }

  .mark-search {
    font: inherit;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: var(--sunken);
    color: var(--ink);
    font-size: 12.5px;
  }

  .mark-search:focus {
    outline: 0;
    background: var(--glass-strong);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .marks {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    max-height: 232px;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .mark-pick {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
    transition: background 0.14s, color 0.14s, transform 0.14s var(--ease);
  }

  .mark-pick:hover {
    background: var(--sunken);
    color: var(--ink);
    transform: translateY(-1px);
  }

  /* quello che c'è adesso: si vede senza cercarlo */
  .mark-pick.is-on {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--ink);
  }

  .mark-pick :global(.ico) { width: 18px; height: 18px; stroke-width: 2; }

  .none {
    margin: 0;
    padding: 6px 4px 8px;
    font-size: 11.5px;
    color: var(--ink-3);
  }
</style>
