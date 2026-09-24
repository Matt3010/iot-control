<script lang="ts">
  import type { CatalogEntry } from '../../shared/protocol';
  import { ui } from '../lib/ui.svelte';
  import SearchPicker from './SearchPicker.svelte';

  /**
   * Tutte le marche che si possono collegare, da cercare per nome.
   *
   * Il catalogo lo dà la centrale dell'agente, e sono quasi mille: Shelly,
   * Philips Hue, IKEA, Xiaomi e quello che viene. Qui si sceglie e basta; la
   * conversazione per collegare la fa chi ha aperto la finestra.
   */
  let { voci, onpick }: { voci: CatalogEntry[]; onpick: (voce: CatalogEntry) => void } = $props();

  // svelte-ignore state_referenced_locally
  const elenco = voci.map((voce) => ({ id: voce.handler, name: voce.name }));

  function scegli(handler: string): void {
    const voce = voci.find((one) => one.handler === handler);
    if (!voce) return;
    // prima la scelta, poi la finestra: chiusa per prima, si portava via chi doveva riceverla
    onpick(voce);
    ui.closeModal();
  }
</script>

<SearchPicker
  voci={elenco}
  chiave="catalogo"
  placeholder="Cerca una marca o un protocollo"
  vuoto="Nessuna marca con questo nome."
  onpick={scegli}
/>
