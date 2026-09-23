<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte';
  import type { Column } from '../lib/table';

  /**
   * Una tabella di righe corte.
   *
   * Quando le cose da mostrare sono tante e ognuna dice poco — un'ora, un
   * nome, tre parole — le schede sono il modo sbagliato: fanno occupare mezza
   * pagina a cinque righe di testo, e per confrontarle bisogna leggerle una
   * per una. In colonna invece l'occhio scende dritto e i dati si incolonnano
   * da soli.
   *
   * Chi la usa passa le colonne e disegna le celle: la tabella tiene
   * l'intestazione, le larghezze e il colpo d'occhio, e non sa cosa c'è
   * dentro. Una cella allineata a destra si scrive `<td class="end">`.
   */
  let {
    columns,
    rows,
    row,
    empty,
    foot,
    label,
  }: {
    columns: Column[];
    rows: T[];
    /** Le celle di una riga: `<td>` e basta. */
    row: Snippet<[T]>;
    /** Cosa si legge quando non c'è niente. Il vuoto è una risposta. */
    empty?: Snippet;
    /**
     * Sotto l'ultima riga: di solito le frecce.
     *
     * La tabella non pagina da sé apposta. Un elenco corto sta in memoria e
     * uno lungo arriva dal server un pezzo per volta, e una tabella che
     * decidesse lei quale dei due è obbligherebbe il secondo a scaricare
     * tutto per mostrarne otto.
     */
    foot?: Snippet;
    /** Come si chiama questa tabella, per chi non la vede. */
    label?: string;
  } = $props();
</script>

{#if rows.length}
  <table aria-label={label}>
    <colgroup>
      {#each columns as column, at (at)}
        <col style={column.width ? `width: ${column.width}` : undefined} />
      {/each}
    </colgroup>

    <thead>
      <tr>
        {#each columns as column, at (at)}
          <th scope="col" class:end={column.align === 'end'}>{column.label}</th>
        {/each}
      </tr>
    </thead>

    <tbody>
      {#each rows as one (one.id)}
        <tr>{@render row(one)}</tr>
      {/each}
    </tbody>
  </table>

  {@render foot?.()}
{:else if empty}
  {@render empty()}
{/if}

<style>
  table {
    width: 100%;
    border-collapse: separate;
    /* le righe si toccano: la linea la mette la cella, non il bordo */
    border-spacing: 0;
    font-size: 12px;
    /* le cifre stanno in colonna anche quando cambiano */
    font-variant-numeric: tabular-nums;
  }

  /* l'intestazione e' un'etichetta, non una riga: piccola, in alto, e separata
     da quello che c'e' sotto da una linea sola */
  th {
    padding: 0 10px 9px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
    color: var(--ink-3);
    white-space: nowrap;
    border-bottom: 1px solid var(--hairline);
  }

  tbody :global(td) {
    padding: 10px;
    border-bottom: 1px solid var(--hairline-soft);
    color: var(--ink-2);
    line-height: 1.35;
    vertical-align: middle;
  }

  /* l'ultima riga non ha niente sotto da separare: la linea la' sembrerebbe
     l'inizio di un'altra tabella */
  tbody tr:last-child :global(td) { border-bottom: 0; }

  /* le celle ai bordi si allineano al filo della scheda: una tabella che
     rientra di dieci pixel sembra appoggiata sopra invece che dentro */
  th:first-child,
  tbody :global(td:first-child) { padding-left: 2px; }

  th:last-child,
  tbody :global(td:last-child) { padding-right: 2px; }

  tbody tr :global(td) { transition: background 0.14s; }

  tbody tr:hover :global(td) { background: var(--sunken); }

  tbody tr :global(td:first-child) { border-radius: var(--r-sm) 0 0 var(--r-sm); }

  tbody tr :global(td:last-child) { border-radius: 0 var(--r-sm) var(--r-sm) 0; }

  th.end,
  tbody :global(td.end) { text-align: right; }
</style>
