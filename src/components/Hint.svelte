<script lang="ts">
  import { ui } from '../lib/ui.svelte';
</script>

{#if ui.picking}
  <div id="hint">
    Clicca sulla mappa per scegliere il punto
    <kbd>Esc</kbd>
  </div>
{/if}
