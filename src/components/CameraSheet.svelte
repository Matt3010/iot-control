<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Una telecamera a tutto schermo.
   *
   * È una finestra di sistema — `showModal` — e non un riquadro grande: così
   * sta sopra a tutto senza dipendere da dove si trovava nella pagina (dentro
   * una card, dentro una colonna, dentro qualsiasi cosa), si chiude con Esc,
   * e su un telefono copre davvero lo schermo.
   *
   * Qui dentro non c'è nessuna logica di diretta o di fotografie: l'indirizzo
   * da mostrare lo decide chi la apre. Questa sa solo farsi grande, dire di
   * chi è l'immagine, e chiudersi.
   */
  let {
    name,
    src,
    onready,
    onclose,
  }: {
    name: string;
    src: string;
    /** Il primo fotogramma è a schermo: chi l'ha aperta può fermare il suo. */
    onready: () => void;
    onclose: () => void;
  } = $props();

  let sheet = $state<HTMLDialogElement | undefined>();

  // Appena c'è, si apre: una finestra che esiste e non si vede non serve.
  $effect(() => {
    if (sheet && !sheet.open) sheet.showModal();
  });
</script>

<dialog
  class="big"
  bind:this={sheet}
  {onclose}
  onclick={(event) => {
    // fuori dall'immagine si chiude: è il gesto che fanno tutti
    if (event.target === sheet) sheet?.close();
  }}
>
  <img {src} alt={`${name} a tutto schermo`} onload={onready} />

  <div class="over">
    <span class="who">{name}</span>
    <Button look="icon" size="sm" title="Chiudi" onclick={() => sheet?.close()}>
      <Icon name="close" />
    </Button>
  </div>
</dialog>

<style>
  /* nero intorno, e l'immagine intera: a tutto schermo non si taglia niente,
     perché il pezzo tagliato è sempre quello che volevi vedere */
  .big {
    width: 100vw;
    max-width: 100vw;
    /* sta nello strato più alto, fuori dal corpo: il pezzo che iOS lascia
       fuori sotto va aggiunto qui a mano */
    height: calc(100dvh + var(--sotto, 0px));
    max-height: calc(100dvh + var(--sotto, 0px));
    padding: 0;
    border: 0;
    background: #000;
    overflow: hidden;
  }

  .big::backdrop { background: #000; }

  .big img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  /* il nome e la chiusura stanno sopra l'immagine, su una sfumatura: sopra a
     un'inquadratura chiara il bianco su bianco non si legge */
  .over {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: max(10px, env(safe-area-inset-top)) 12px 18px;
    color: #fff;
    background: linear-gradient(180deg, rgb(0 0 0 / 0.55), transparent);
  }

  .over .who {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
