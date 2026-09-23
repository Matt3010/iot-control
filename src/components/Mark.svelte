<script lang="ts">
  import { createElement } from 'lucide';
  import { markOf } from '../lib/marks';

  /**
   * Il segno di una categoria.
   *
   * Nel campo ci può stare la chiave di un disegno — «restaurant» — o
   * un'emoji, che è quello che ci finiva prima. Qui si guarda cosa c'è e si
   * disegna di conseguenza: le categorie di ieri restano come sono finché
   * qualcuno non le cambia, e nessuno si ritrova i dati riscritti sotto i
   * piedi per una decisione di stile.
   *
   * Il disegno prende il colore di chi lo contiene, che è il punto: un'emoji
   * ha colori suoi e litiga con quello della categoria.
   */
  let { value, size = 16 }: { value: string | undefined; size?: number } = $props();

  const mark = $derived(markOf(value));

  const drawn = $derived.by(() => {
    if (!mark) return '';
    const svg = createElement(mark.icon);
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    return svg.outerHTML;
  });
</script>

{#if mark}
  <span class="mark-ico" style:--s={`${size}px`} title={mark.label}>{@html drawn}</span>
{:else}
  <!-- niente chiave: è una categoria di prima, con la sua emoji -->
  <span class="mark-emo" style:--s={`${size}px`}>{value || '📍'}</span>
{/if}

<style>
  .mark-ico {
    display: inline-grid;
    place-items: center;
    width: var(--s);
    height: var(--s);
    color: inherit;
  }

  .mark-ico :global(.ico) {
    width: 100%;
    height: 100%;
    stroke-width: 2;
  }

  .mark-emo {
    font-family: var(--emoji);
    font-size: calc(var(--s) * 0.86);
    line-height: 1;
  }
</style>
