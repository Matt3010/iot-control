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
    return () => node.removeEventListener('emoji-click', onPick);
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
  --border-color: var(--hairline);
  --border-size: 0;
  --indicator-color: var(--ink);
  --input-border-color: var(--hairline);
  --input-font-color: var(--ink);
  --input-placeholder-color: var(--ink-3);
  --input-border-radius: 10px;
  --button-active-background: var(--sunken-hover);
  --button-hover-background: var(--sunken);
  --category-font-color: var(--ink-3);
  --category-font-size: 11px;
  --emoji-padding: 0.4rem;
  --num-columns: 8;
  font-family: var(--font);
}
</style>
