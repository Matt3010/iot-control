<script lang="ts">
  import { offriIlFondo } from '../lib/fondo.svelte';
  import { ui, type ModalAction } from '../lib/ui.svelte';
  import { swipeToClose } from '../lib/swipe';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * La finestra che si apre davanti a tutto.
   *
   * È un guscio e basta: la testa con il titolo e la chiusura, il corpo, e
   * in fondo i tasti. Dentro non ci sta del contenuto scritto qui — ci sta
   * **un componente**, quello che chi la apre le passa. È il punto di tutto:
   * lo stesso componente può stare dentro a un pannello o dentro a una
   * finestra e non se ne accorge, perché non sa dove sta.
   *
   * Su uno schermo grande si apre di lato, come ha sempre fatto la scheda di
   * un luogo: c'è una mappa dietro, e coprirla tutta per due righe sarebbe
   * togliere il contesto a chi sta lavorando. Su un telefono dietro non c'è
   * niente, e allora prende lo schermo: appoggiata in fondo restava alta
   * quanto quello che aveva dentro, e lasciava sopra di sé mezzo schermo di
   * nero con gli angoli tondi a disegnare una cornice intorno al niente.
   *
   * I tasti in fondo sono i tasti dell'app, non dei suoi: chi la apre dice
   * cosa scrivono e cosa fanno, e il vestito — quale è quello importante,
   * quale porta via qualcosa — lo sceglie con le stesse parole che userebbe
   * ovunque.
   */
  const request = $derived(ui.modal!);

  /*
   * I tasti in fondo, che può dettare anche chi sta dentro.
   *
   * Chi apre la finestra ne passa una lista se li conosce già. Ma i tasti di
   * una scheda cambiano con lei — «Elimina» compare solo su un luogo che
   * esiste — e quelli li detta il componente, con un modo di ricavarli che
   * qui si richiama ogni volta che qualcosa dentro si muove.
   */
  let dettati = $state<(() => ModalAction[]) | null>(null);
  offriIlFondo({ detta: (azioni) => (dettati = azioni) });

  const azioni = $derived(dettati ? dettati() : (request.actions ?? []));

  /** Un tasto che risponde «no» chiude e basta; gli altri lo dicono loro. */
  async function press(at: number, anchor: HTMLElement): Promise<void> {
    const azione = azioni[at];
    if (!azione) return;

    const resta = await azione.onpick(anchor);
    if (resta !== false) ui.closeModal();
  }
</script>

<!-- `div` e non `aside`: una finestra che copre tutto non è «contenuto a
     lato», e chi legge lo schermo ad alta voce deve sentirsi dire che è
     una finestra, non un margine della pagina -->
<div
  class="surface modal"
  role="dialog"
  aria-modal="true"
  aria-label={request.title}
  use:swipeToClose={() => ui.closeModal()}
>
  <header>
    <h2>{request.title}</h2>
    <Button look="icon" title="Chiudi" onclick={() => ui.closeModal()}>
      <Icon name="close" />
    </Button>
  </header>

  <!-- quello che c'è dentro: un componente, che non sa di essere qui -->
  <div class="modal-body">
    {#if request.view}
      {@const Vista = request.view}
      <Vista {...request.props ?? {}} />
    {/if}
  </div>

  {#if azioni.length}
    <div class="modal-foot">
      {#each azioni as azione, at (azione.label)}
        <Button
          look={azione.look ?? 'ghost'}
          tone={azione.tone}
          disabled={azione.disabled}
          onclick={(event: MouseEvent) => void press(at, event.currentTarget as HTMLElement)}
        >
          {#if azione.icon}<Icon name={azione.icon} />{/if}
          {azione.label}
        </Button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Dove sta, quanto è larga e cosa le succede su un telefono lo dice la
     scatola in base.css, che è la stessa della scheda di un luogo. Qui c'è
     solo come è fatta dentro: tre fasce, e quella di mezzo è l'unica che
     scorre. */
  .modal {
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* la scatola la lascia scorrere tutta; qui scorre solo il corpo, se no
       il tasto che conferma se ne va mentre scrivi */
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex: none;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 620;
    letter-spacing: -0.015em;
    color: var(--ink);
  }

  .modal-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: grid;
    align-content: start;
    gap: 10px;
    /*
     * Un po' di aria intorno, e ripresa fuori.
     *
     * Quello che scorre taglia quello che sporge, e a sporgere sono le
     * ombre: la riga di una categoria ha la sua, e contro il bordo del
     * corpo si vedeva mozzata di netto su tutti e quattro i lati. Il
     * riempimento le lascia il posto, il margine negativo rimette il
     * contenuto in riga con il titolo qui sopra.
     */
    margin: -6px;
    padding: 6px;
  }

  /* i tasti in fondo, a destra come ovunque nell'app */
  .modal-foot {
    flex: none;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline-soft);
  }

  @media (max-width: 600px) {
    /* in fondo i tasti si allargano, perché un dito non mira e qui sotto non
       c'è nient'altro da premere per sbaglio */
    .modal-foot :global(.btn) { flex: 1; justify-content: center; }

    /* Quello che porta via qualcosa no. Allargato sembrava uno dei due
       grandi, e la sua scritta — «Elimina luogo» — andava a capo. */
    .modal-foot :global(.btn.danger) { flex: none; white-space: nowrap; }
  }
</style>
