<script lang="ts">
  import 'emoji-picker-element';
  // Emoji data is bundled and served locally: no CDN call at runtime.
  import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url';
  import { placeBeside } from '../lib/popover';
  import { ui } from '../lib/ui.svelte';

  const request = $derived(ui.emoji!);
  const at = $derived(placeBeside(request.anchor, 304, 322));

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
      const pick = request.onPick;
      ui.emoji = null;
      pick(emoji);
    };
    node.addEventListener('emoji-click', onPick);
    return () => node.removeEventListener('emoji-click', onPick);
  }
</script>

<div id="emoji-popover" class="surface" style:left="{at.left}px" style:top="{at.top}px">
  <emoji-picker class={dark.matches ? 'dark' : 'light'} use:picker></emoji-picker>
</div>
