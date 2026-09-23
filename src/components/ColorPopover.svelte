<script lang="ts">
  import { COLORS } from '../lib/format';
  import { ui } from '../lib/ui.svelte';
  import Popover from './Popover.svelte';

  const request = $derived(ui.color!);
</script>

<Popover anchor={request.anchor} width={309} height={135} id="color-popover" onclose={() => (ui.color = null)}>
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
</Popover>

<style>
/* the palette that opens from it */
.swatches {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 5px;
  padding: 12px;
}

.swatch-dot {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--c);
  background-image: linear-gradient(160deg, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0) 60%);
  box-shadow: inset 0 0 0 1px rgb(14 17 22 / 0.14);
  transition: transform 0.14s var(--ease), box-shadow 0.18s;
}

.swatch-dot:hover { transform: scale(1.1); }

.swatch-dot.is-on {
  box-shadow:
    inset 0 0 0 1px rgb(14 17 22 / 0.14),
    0 0 0 2px var(--glass-strong),
    0 0 0 3.5px var(--c);
}

/* il vetro e la posizione li mette il foglietto: qui resta la sola cosa che
   riguarda i colori, cioe' che stanno attaccati al bordo */
:global(#color-popover) { padding: 0; }
</style>
