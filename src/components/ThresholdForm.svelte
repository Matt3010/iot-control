<script lang="ts">
  import { tasti } from '../lib/fondo.svelte';
  import { ui } from '../lib/ui.svelte';
  import TextField from './TextField.svelte';

  /**
   * Il numero di una soglia: «sopra quanto?».
   *
   * Sta in una finestra perché è l'unica cosa da scrivere in mezzo a due
   * scelte fatte col dito, e un foglietto con un campo dentro sotto un tasto
   * piccolo, su un telefono, lo copre la tastiera. I tasti in fondo li detta
   * lei: «Aggiungi» si accende solo quando c'è un numero.
   */
  let {
    domanda,
    unit,
    onsave,
  }: {
    /** Come si legge quello che si sta scrivendo: «Temperatura sale sopra». */
    domanda: string;
    unit?: string;
    onsave: (soglia: number) => void;
  } = $props();

  let scritto = $state('');
  // la virgola è come si scrive un numero in Italia: si accetta, e si capisce
  const soglia = $derived(Number(scritto.trim().replace(',', '.')));
  const valida = $derived(scritto.trim() !== '' && Number.isFinite(soglia));

  function salva(): boolean {
    if (!valida) return false;
    onsave(soglia);
    return true;
  }

  tasti(() => [
    { label: 'Annulla', look: 'ghost', onpick: () => undefined },
    { label: 'Aggiungi', look: 'primary', disabled: !valida, onpick: () => (salva() ? undefined : false) },
  ]);
</script>

<form class="soglia" onsubmit={(event) => (event.preventDefault(), salva() && ui.closeModal())}>
  <span class="domanda">{domanda}</span>
  <div class="campo">
    <!-- svelte-ignore a11y_autofocus -->
    <TextField kind="text" inputmode="decimal" placeholder="Un numero" bind:value={scritto} autofocus label={domanda} />
    {#if unit}<span class="unita">{unit}</span>{/if}
  </div>
</form>

<style>
  .soglia { display: grid; gap: 8px; }

  .domanda { font-size: 13px; color: var(--ink-2); }

  .campo { display: flex; align-items: center; gap: 10px; }

  .campo :global(.text-field) { flex: 1; min-width: 0; }

  .unita { font-size: 13px; color: var(--ink-3); }
</style>
