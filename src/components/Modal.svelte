<script lang="ts">
  import { ui } from '../lib/ui.svelte';
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

  /** Un tasto che risponde «no» chiude e basta; gli altri lo dicono loro. */
  async function press(at: number): Promise<void> {
    const azione = request.actions?.[at];
    if (!azione) return;

    const resta = await azione.onpick();
    if (resta !== false) ui.closeModal();
  }
</script>

<aside
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

  {#if request.actions?.length}
    <div class="modal-foot">
      {#each request.actions as azione, at (azione.label)}
        <Button look={azione.look ?? 'ghost'} disabled={azione.disabled} onclick={() => void press(at)}>
          {azione.label}
        </Button>
      {/each}
    </div>
  {/if}
</aside>

<style>
  /* Di lato, dove dietro c'è una mappa che vale la pena lasciar vedere. */
  .modal {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: var(--z-sheet);
    width: min(356px, calc(100vw - 28px));
    max-height: calc(100vh - 28px);
    padding: var(--card-pad);
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    animation: sheet-in 0.32s var(--ease);
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

  /* il corpo è l'unica parte che scorre: la testa e i tasti restano fermi,
     se no il tasto che conferma se ne va mentre scrivi */
  .modal-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: grid;
    align-content: start;
    gap: 10px;
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
    /*
     * Su un telefono prende lo schermo.
     *
     * Dietro non c'è nessuna mappa da lasciar vedere, quindi non c'è niente
     * da cui staccarsi: gli angoli tondi disegnavano una cornice intorno a
     * un bordo che non esiste, e i margini regalavano al nero ventiquattro
     * pixel di larghezza su trecentonovanta.
     */
    .modal {
      inset: 0;
      width: auto;
      max-height: none;
      border: 0;
      border-radius: 0;
      padding-top: calc(22px + env(safe-area-inset-top));
      padding-bottom: calc(var(--card-pad) + env(safe-area-inset-bottom));
      animation-name: sheet-in-mobile;
    }

    /* la maniglia: dice che si può spingere via col dito, e swipeToClose
       la fa seguire */
    .modal::before {
      content: '';
      position: absolute;
      top: calc(9px + env(safe-area-inset-top));
      left: 50%;
      transform: translateX(-50%);
      width: 38px;
      height: 4px;
      border-radius: 99px;
      background: var(--hairline);
    }

    /* in fondo i tasti si allargano: un dito non mira, e qui sotto non c'è
       nient'altro da premere per sbaglio */
    .modal-foot :global(.btn) { flex: 1; justify-content: center; }
  }
</style>
