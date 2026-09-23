<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Una scheda nella colonna di una pagina di servizio.
   *
   * Il riquadro di vetro con il bordo sottile: è lo stesso in ogni pagina, e
   * scritto una volta sola non può più venire di due grigi diversi a seconda
   * di dove guardi. Le pagine che hanno bisogno di un'altra scheda — quella
   * tratteggiata del «creane un altro» — se la disegnano da sé: è un'altra
   * cosa, e fingere che sia la stessa costerebbe più di quanto risparmia.
   */
  let {
    wide = false,
    children,
  }: {
    /**
     * Attraverso tutte le colonne invece che dentro una.
     *
     * Una tabella è fatta di righe che si leggono per intero: in trecento
     * pixel ogni riga va a capo due volte e le colonne non si incolonnano
     * più — tanto vale un elenco. Chi ha bisogno di larghezza la chiede.
     */
    wide?: boolean;
    children: Snippet;
  } = $props();
</script>

<section class="card" class:wide>
  {@render children()}
</section>

<style>
  .card {
    /* non si spezza fra due colonne: si sposta intera */
    break-inside: avoid;
    display: grid;
    gap: 10px;
    min-width: 0;
    /* lo spazio sotto è suo, non della colonna */
    margin: 0 0 14px;
    padding: var(--card-pad);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    background: var(--glass-strong);
  }

  /* attraverso tutte le colonne, in tutti e due i modi di disporle */
  .card.wide {
    column-span: all;
    grid-column: 1 / -1;
  }
</style>
