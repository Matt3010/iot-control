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
  <!-- Le colonne non si tolgono quando lo schermo è stretto: quella che
       sparisce è sempre quella che a qualcuno serviva, e una tabella che
       cambia forma va riletta ogni volta. Qui invece scorre di lato, e
       quello che non ci sta resta raggiungibile invece che tagliato dal
       bordo della scheda. -->
  <div class="scorre">
    <table aria-label={label}>
      <colgroup>
        {#each columns as column, at (at)}
          <!-- `1%` non è una larghezza: è il modo di dire a una tabella di
               stringere quella colonna a quello che c'è dentro -->
          <col style={column.width ? `width: ${column.width === 'fit' ? '1%' : column.width}` : undefined} />
        {/each}
      </colgroup>

      <thead>
        <tr>
          {#each columns as column, at (at)}
            <th scope="col" class:end={column.align === 'end'} class:fit={column.width === 'fit'}>
              {column.label}
            </th>
          {/each}
        </tr>
      </thead>

      <tbody>
        {#each rows as one (one.id)}
          <tr>{@render row(one)}</tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- le frecce restano ferme: scorrono le righe, non i comandi -->
  {@render foot?.()}
{:else if empty}
  {@render empty()}
{/if}

<style>
  /* La finestra da cui si guarda: quello che non ci sta si raggiunge
     scorrendo, invece di restare tagliato dal bordo della scheda. */
  .scorre {
    overflow-x: auto;
    /* lo slancio del dito, come in ogni altra cosa che scorre sul telefono */
    -webkit-overflow-scrolling: touch;
    /* la riga si ferma dove finisce una colonna, non a metà di una parola */
    scroll-snap-type: x proximity;
    /* il filo sotto le celle arriva fino in fondo anche quando si scorre */
    padding-bottom: 1px;
  }

  /* su un telefono la barra ruba due righe di tabella: si vede mentre scorri
     e poi se ne va, come fa il sistema da solo */
  .scorre::-webkit-scrollbar { height: 4px; }

  .scorre::-webkit-scrollbar-thumb {
    border-radius: 99px;
    background: color-mix(in srgb, var(--ink-3) 40%, transparent);
  }

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
    /* Una riga sta su una riga. Da quando la tabella scorre, mandare a capo
       non fa stare niente in più: stringe la colonna libera e spezza «ha
       smesso di rispondere» su cinque righe, alzando la riga di quattro. */
    white-space: nowrap;
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

  /* Una fascia dritta, senza angoli tondi. La linea che separa le righe sta
     sulle stesse celle, e con gli angoli tondi si piegava anche lei ai due
     capi, come un nastro invece che un filo. */
  tbody tr:hover :global(td) { background: var(--sunken); }

  th.end,
  tbody :global(td.end) { text-align: right; }

  /* una colonna stretta al contenuto non deve mandare a capo: sarebbe
     stringerla fino alla parola più lunga e poi spezzare le altre */
  th.fit,
  tbody :global(td.fit) { white-space: nowrap; }
</style>
