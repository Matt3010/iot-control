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

<style>
/* search trigger --------------------------------------------------------- */

#search-trigger {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 10px 10px 11px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: var(--sunken);
  color: var(--ink-3);
  font-size: 13px;
  text-align: left;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

#search-trigger:hover { background: var(--sunken-hover); color: var(--ink-2); }

#search-trigger span { flex: 1; min-width: 0; }

#search-trigger kbd {
  flex: none;
  font: inherit;
  font-size: 10.5px;
  font-weight: 560;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--glass-strong);
  box-shadow: inset 0 0 0 1px var(--hairline);
  color: var(--ink-3);
}
</style>
