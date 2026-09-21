<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';

  const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  const noCategories = $derived(store.categories.length === 0);
</script>

<div class="empty">
  {#if noCategories}
    <p class="empty-title">Si comincia da una categoria.</p>
    <p class="empty-line">
      Le dai un'emoji e un colore, e diventa il segno dei posti che ci metti dentro.
    </p>
    <Button look="ghost" onclick={() => ui.openManage('categories', 'add')}>
      Crea una categoria
    </Button>
  {:else}
    <p class="empty-title">Nessun posto, per ora.</p>
    <ol class="empty-steps">
      <li><b>Aggiungi posto</b>, poi clicca sulla mappa dove si trova.</li>
      <li>Oppure <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd> e cerca un indirizzo.</li>
    </ol>
  {/if}
</div>

<style>
  .empty {
    display: grid;
    gap: 8px;
    padding: 10px 8px 6px;
  }

  .empty-title {
    margin: 0;
    font-size: 13px;
    font-weight: 560;
    letter-spacing: -0.008em;
  }

  .empty-line {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink-3);
  }

  .empty-steps {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink-3);
  }

  .empty-steps b { color: var(--ink-2); font-weight: 560; }

  .empty-steps kbd {
    font: inherit;
    font-size: 10.5px;
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--hairline);
  }

  .empty :global(.btn) { justify-self: start; margin-top: 2px; }
</style>
