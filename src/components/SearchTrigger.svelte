<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';

  const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
</script>

<button id="search-trigger" type="button" onclick={() => (ui.paletteOpen = true)}>
  <Icon name="search" />
  <span>Cerca un posto o un indirizzo</span>
  <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
</button>
