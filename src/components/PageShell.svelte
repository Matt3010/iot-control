<script lang="ts">
  import type { Snippet } from 'svelte';
  import { nav } from '../lib/nav.svelte';
  import { AGENTS_PATH, ALERTS_PATH, SCENES_PATH } from '../lib/routing';
  import Icon from './Icon.svelte';
  import Tabs from './Tabs.svelte';

  /**
   * Il foglio delle pagine grandi: agenti, scene, avvisi — e le mappe.
   *
   * Agenti, scene e avvisi stavano in una colonna sola, che cresceva a ogni
   * aggiunta finché per arrivare agli avvisi bisognava scorrere oltre tutte
   * le macchine di casa. Ora ognuna ha la sua pagina e la stessa testa: si
   * torna alla mappa da un posto solo, e si passa dall'una all'altra senza
   * tornare indietro.
   *
   * Le mappe usano la stessa testa ma non stanno in quella fila: non sono
   * una terza cosa di casa, sono i fogli su cui sta tutto il resto, e ci si
   * arriva da dove si sceglie quale guardare. Per questo la fila si spegne.
   */
  let {
    title,
    count,
    lead,
    siblings = true,
    meta,
    back = { href: '/', label: 'Torna alla mappa' },
    layout = 'columns',
    children,
  }: {
    title: string;
    /** Quante cose ci sono dentro, se dirlo aiuta. Zero non si scrive. */
    count?: number;
    /** Una riga che dice a cosa serve la pagina. Sparisce se non serve. */
    lead?: string;
    /**
     * Una riga sotto il titolo, dentro la testata.
     *
     * È roba del titolo — come sta questo agente, dove sta — e messa fra le
     * schede se ne staccava: sotto ci sono i ventidue pixel che separano la
     * testata dal contenuto, e quella riga finiva dalla parte sbagliata.
     */
    meta?: Snippet;
    /** Se questa pagina sta nella fila delle altre. Le mappe no. */
    siblings?: boolean;
    /**
     * Dove porta il link in cima, quando non è la mappa.
     *
     * La pagina di un agente si apre dall'elenco degli agenti, e tornare da
     * lì alla mappa vorrebbe dire rifare due clic per guardare quello
     * accanto.
     */
    back?: { href: string; label: string };
    /**
     * Come si dispongono le schede.
     *
     * `columns` è il difetto: si accodano una sotto l'altra come in un
     * giornale, e va bene dove sono alte in modo imprevedibile — un agente
     * collegato è lungo una pagina, uno appena creato sono tre righe.
     *
     * `rows` le mette in riga vere, con la stessa altezza e lo stesso stacco
     * fra tutte. Serve dove sotto c'è qualcosa di largo, perché a colonne il
     * bordo di sotto resta frastagliato e il vuoto prima della tabella viene
     * di due misure diverse a seconda di dove guardi.
     */
    layout?: 'columns' | 'rows';
    children: Snippet;
  } = $props();

  const DOVE = [
    { id: AGENTS_PATH, label: 'Agenti', href: AGENTS_PATH },
    { id: SCENES_PATH, label: 'Scene', href: SCENES_PATH },
    { id: ALERTS_PATH, label: 'Avvisi', href: ALERTS_PATH },
  ];

  const here = $derived(nav.path.replace(/\/$/, ''));
</script>

<div class="page">
  <header>
    <a class="back" href={back.href}>
      <Icon name="collapse" />
      {back.label}
    </a>

    <div class="named">
      <h1>{title}</h1>
      {#if count}<span class="how-many">{count}</span>{/if}
    </div>
    {#if lead}<p class="lead">{lead}</p>{/if}
    {@render meta?.()}

    <!-- Le altre stanze, sempre a portata: chi è venuto per gli agenti scopre
         che esistono le scene senza doverle cercare, e chi si è sbagliato di
         porta non deve tornare alla mappa per rimediare. Sono le linguette
         dell'app, con gli indirizzi dentro: un disegno solo per tutt'e due. -->
    {#if siblings}<Tabs value={here} options={DOVE} label="Le altre pagine" />{/if}
  </header>

  <!-- A colonne, non a griglia: una scheda collegata e' alta, una appena
       creata sono tre righe, e in una griglia la riga prende l'altezza della
       piu' alta lasciando accanto un buco grande come mezza pagina. -->
  <div class="cards {layout}">
    {@render children()}
  </div>
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    overflow: auto;
    /* Gli angoli del telefono: installata nella schermata home la pagina
       arriva fin sotto l'orologio, e in orizzontale fin dentro la tacca. */
    padding: calc(28px + env(safe-area-inset-top)) max(20px, env(safe-area-inset-right))
      calc(48px + env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
    background: rgb(var(--base));
  }

  header {
    max-width: 960px;
    margin: 0 auto 22px;
    display: grid;
    gap: 6px;
  }

  .back {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12.5px;
    color: var(--ink-3);
    text-decoration: none;
    transition: color 0.16s;
  }

  .back:hover { color: var(--ink); }

  /* la freccia guarda a sinistra: è un ritorno, non un pannello che si chiude */
  .back :global(.ico) { width: 14px; height: 14px; transform: rotate(-90deg); }

  .named { display: flex; align-items: baseline; gap: 9px; }

  /* il conto accanto al titolo, non dentro: è un dato, non un nome */
  .how-many {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-3);
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 620;
    letter-spacing: -0.022em;
    color: var(--ink);
  }

  .lead {
    margin: 0 0 4px;
    max-width: 62ch;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-3);
  }

  .cards {
    max-width: 960px;
    margin: 0 auto;
  }

  .cards.columns {
    columns: 380px;
    column-gap: 14px;
  }

  /* lo stacco fra le righe lo tiene la scheda, come a colonne: qui il vuoto
     è zero, se no le due misure si sommerebbero */
  .cards.rows {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    column-gap: 14px;
    row-gap: 0;
    align-items: stretch;
  }
</style>
