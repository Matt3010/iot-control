<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';
</script>

<button
  id="add-btn"
  type="button"
  class:active={ui.picking}
  onclick={() => ui.setPicking(!ui.picking)}
>
  <Icon name="plus" />
  <span class="add-label">{ui.picking ? 'Annulla' : 'Aggiungi posto'}</span>
</button>
