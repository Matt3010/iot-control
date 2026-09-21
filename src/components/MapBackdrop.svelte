<script lang="ts">
  import { stillMap } from '../lib/mapkit';

  /** La stessa mappa dell'app, ma solo da guardare: è lo sfondo della porta. */
  let container = $state<HTMLDivElement>();

  $effect(() => {
    if (!container) return;
    const map = stillMap(container, { center: [45.4668, 9.1905], zoom: 14 });
    return () => map.remove();
  });
</script>

<div id="map" class="backdrop" bind:this={container} aria-hidden="true"></div>

<style>
  /* z-index esplicito: i pannelli di Leaflet stanno a 400 e senza un contesto
     proprio salirebbero sopra il modulo d'ingresso */
  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
</style>
