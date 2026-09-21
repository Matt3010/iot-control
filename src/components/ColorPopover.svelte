<script lang="ts">
  import { COLORS } from '../lib/format';
  import { placeAnchored } from '../lib/popover';
  import { ui } from '../lib/ui.svelte';

  const request = $derived(ui.color!);
  const at = $derived(placeAnchored(request.anchor, 186, 186));
</script>

<div id="color-popover" class="surface" style:left="{at.left}px" style:top="{at.top}px">
  <div id="swatches" class="swatches">
    {#each COLORS as color (color)}
      <button
        type="button"
        class="swatch-dot"
        class:is-on={color === request.current}
        style:--c={color}
        title={color}
        aria-label={color}
        onclick={() => {
          const pick = request.onPick;
          ui.color = null;
          pick(color);
        }}
      ></button>
    {/each}
  </div>
</div>
