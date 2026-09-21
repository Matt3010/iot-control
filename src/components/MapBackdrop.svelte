<script lang="ts">
  import L from 'leaflet';

  /** La stessa mappa dell'app, ma solo da guardare: è lo sfondo della porta. */
  let container = $state<HTMLDivElement>();

  $effect(() => {
    if (!container) return;
    const map = L.map(container, {
      center: [45.4668, 9.1905],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

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
