<script lang="ts">
  import qrcode from 'qrcode-generator';

  /**
   * Un QR disegnato qui, perché quello che arriva dal server è una stringa e
   * non un'immagine: i pixel li facciamo noi, e li facciamo come vogliamo.
   *
   * Il piatto resta bianco anche col tema scuro, e non per distrazione: un QR
   * chiaro su fondo scuro lo leggono quasi tutti i telefoni, ma «quasi» qui
   * non basta — è la cosa che deve funzionare al primo colpo, di sera, con la
   * mano che trema.
   */
  let { data, label = 'Codice da inquadrare' }: { data: string; label?: string } = $props();

  /**
   * Correzione d'errore alta come quella che usa Home Assistant: un QR
   * inquadrato di sbieco o con un riflesso sopra si legge lo stesso.
   */
  const matrix = $derived.by(() => {
    const code = qrcode(0, 'Q');
    code.addData(data);
    code.make();

    const size = code.getModuleCount();
    const dark: string[] = [];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        // un rettangolo per modulo: mezzo pixel in più copre le fessure che
        // certi browser lasciano fra due rettangoli adiacenti
        if (code.isDark(row, col)) dark.push(`M${col} ${row}h1.02v1.02h-1.02z`);
      }
    }
    return { size, path: dark.join('') };
  });

  /** Il bordo bianco intorno non è decorazione: senza, il codice non si legge. */
  const QUIET = 3;
</script>

<div class="qr">
  <svg
    viewBox="{-QUIET} {-QUIET} {matrix.size + QUIET * 2} {matrix.size + QUIET * 2}"
    role="img"
    aria-label={label}
    shape-rendering="crispEdges"
  >
    <path d={matrix.path} fill="#0e1116" />
  </svg>
</div>

<style>
  .qr {
    justify-self: center;
    width: 190px;
    max-width: 100%;
    padding: 10px;
    border-radius: var(--r-md);
    /* bianco fisso: vedi il commento sopra */
    background: #ffffff;
    box-shadow: var(--shadow-1);
  }

  svg { display: block; width: 100%; height: auto; }
</style>
