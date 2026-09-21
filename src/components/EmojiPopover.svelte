<script lang="ts">
  import 'emoji-picker-element';
  // Emoji data is bundled and served locally: no CDN call at runtime.
  import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url';
  import { placeBeside } from '../lib/popover';
  import { ui } from '../lib/ui.svelte';

  const request = $derived(ui.emoji);
  // Ricrearlo a ogni apertura vorrebbe dire ricaricare e reindicizzare 440KB
  // di emoji ogni volta: resta montato e si limita a scomparire.
  const at = $derived(request ? placeBeside(request.anchor, 304, 322) : { left: 0, top: 0 });

  const dark = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * I 440KB di emoji arrivano una volta sola, ma quella volta il picker mostra
   * una riga di testo in mezzo al vuoto. Guardiamo lo stesso database che usa
   * lui: finché non è pronto, al suo posto sta una griglia finta.
   */
  let ready = $state(false);

  /**
   * Non c'è un evento che dica "ci sono": il modo onesto di sapere se il
   * picker è pronto è guardare se ha disegnato le sue emoji. Dopo sei
   * secondi ci si arrende comunque, che è meglio di una griglia finta
   * che non se ne va più.
   */
  function watchReady(node: HTMLElement): () => void {
    const started = Date.now();
    const timer = setInterval(() => {
      // non i tasti delle categorie in alto (anche quelli sono .emoji): la
      // griglia vera, che compare solo quando i dati sono indicizzati
      const grid = node.shadowRoot?.querySelector('.emoji-menu [role="menuitem"], .emoji-menu button');
      if (grid || Date.now() - started > 5000) {
        ready = true;
        clearInterval(timer);
      }
    }, 120);
    return () => clearInterval(timer);
  }

  function picker(node: HTMLElement) {
    const element = node as HTMLElement & { dataSource: string; i18n: unknown };
    element.dataSource = emojiDataUrl;
    element.i18n = {
      categoriesLabel: 'Categorie',
      emojiUnsupportedMessage: 'Il browser non supporta le emoji a colori.',
      favoritesLabel: 'Usate di recente',
      loadingMessage: 'Carico…',
      networkErrorMessage: 'Impossibile caricare le emoji.',
      regionLabel: 'Scelta emoji',
      searchDescription: 'Usa le frecce per scorrere i risultati, Invio per scegliere.',
      searchLabel: 'Cerca',
      searchResultsLabel: 'Risultati',
      skinToneDescription: 'Usa le frecce per scegliere, Invio per confermare.',
      skinToneLabel: 'Tonalità della pelle (ora: {skinTone})',
      skinTonesLabel: 'Tonalità della pelle',
      skinTones: ['Neutra', 'Chiara', 'Medio-chiara', 'Media', 'Medio-scura', 'Scura'],
      categories: {
        custom: 'Personalizzate',
        'smileys-emotion': 'Faccine ed emozioni',
        'people-body': 'Persone',
        'animals-nature': 'Animali e natura',
        'food-drink': 'Cibo e bevande',
        'travel-places': 'Viaggi e luoghi',
        activities: 'Attività',
        objects: 'Oggetti',
        symbols: 'Simboli',
        flags: 'Bandiere',
      },
    };

    const onPick = (event: Event) => {
      const emoji = (event as CustomEvent<{ unicode: string }>).detail.unicode;
      const pick = ui.emoji?.onPick;
      ui.emoji = null;
      pick?.(emoji);
    };
    node.addEventListener('emoji-click', onPick);
    const stopWatching = watchReady(node);
    return () => {
      node.removeEventListener('emoji-click', onPick);
      stopWatching();
    };
  }
</script>

<div
  id="emoji-popover"
  class="surface"
  hidden={!request}
  style:left="{at.left}px"
  style:top="{at.top}px"
>
  <emoji-picker class={dark.matches ? 'dark' : 'light'} use:picker></emoji-picker>

  {#if !ready}
    <div class="emoji-wait" aria-hidden="true">
      <span class="wait-field"></span>
      <div class="wait-grid">
        {#each Array(40) as _, cell (cell)}
          <span class="wait-cell" style:--n={cell}></span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
/* -------------------------------------------------------------- emoji picker */

#emoji-popover {
  position: absolute;
  z-index: var(--z-popover);
  padding: 0;
  overflow: hidden;
  border-radius: var(--r-lg);
  background: var(--glass-strong);
  box-shadow: var(--shadow-3), inset 0 1px 0 var(--highlight);
  animation: rise 0.22s var(--ease);
}

emoji-picker {
  width: 304px;
  height: 322px;
  --background: transparent;
  --border-color: var(--hairline-soft);
  --border-size: 1px;
  --indicator-color: var(--ink);
  --indicator-height: 2px;
  --input-border-color: var(--hairline);
  --input-border-size: 1px;
  --input-font-color: var(--ink);
  --input-font-size: 13px;
  --input-line-height: 1.3;
  --input-padding: 8px 11px;
  --input-placeholder-color: var(--ink-3);
  --input-border-radius: var(--r-sm);
  --button-active-background: var(--sunken-hover);
  --button-hover-background: var(--sunken);
  --category-font-color: var(--ink-3);
  --category-font-size: 10.5px;
  --category-emoji-size: 1.1rem;
  --emoji-size: 1.35rem;
  --emoji-padding: 0.38rem;
  --outline-color: color-mix(in srgb, var(--accent) 45%, transparent);
  --outline-size: 2px;
  --skintone-border-radius: var(--r-sm);
  --num-columns: 8;
  font-family: var(--font);
}

/* l'attesa ha la forma di quello che sta arrivando, non una riga di testo */
.emoji-wait {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 14px;
  padding: 12px;
  /* opaco davvero: sotto c'e' il picker che sta ancora caricando */
  background: rgb(var(--base));
}

.wait-field {
  height: 34px;
  border-radius: var(--r-sm);
  background: var(--sunken);
  box-shadow: inset 0 0 0 1px var(--hairline-soft);
}

.wait-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  align-content: start;
}

.wait-cell {
  aspect-ratio: 1;
  border-radius: var(--r-sm);
  background: var(--sunken-hover);
  animation: wait-breathe 1.6s var(--ease) infinite;
  animation-delay: calc(var(--n) * 24ms);
}

@keyframes wait-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}
</style>
