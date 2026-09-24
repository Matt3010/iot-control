<script lang="ts">
  /**
   * Quello che si vede da una telecamera, grande quanto lo schermo.
   *
   * È il contenuto di una finestra e non una finestra: la apre chi la chiede
   * con `ui.openModal`, a tutto schermo (`intera`). Era una finestra di
   * sistema a sé, fuori dalla pila delle altre, e un Esc la chiudeva insieme
   * a quella che le stava sotto.
   *
   * Qui dentro non c'è nessuna logica di diretta o di fotografie: l'indirizzo
   * da mostrare lo decide chi la apre, e il nome e la chiusura li mette la
   * finestra. Questa sa solo mostrare l'immagine intera.
   */
  let {
    name,
    src,
    onready,
  }: {
    name: string;
    src: string;
    /** Il primo fotogramma è a schermo: chi l'ha aperta può fermare il suo. */
    onready: () => void;
  } = $props();
</script>

<img {src} alt={`${name} a tutto schermo`} onload={onready} />

<style>
  /* l'immagine intera: a tutto schermo non si taglia niente, perché il pezzo
     tagliato è sempre quello che volevi vedere */
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
</style>
