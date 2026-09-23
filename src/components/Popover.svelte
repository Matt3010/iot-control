<script lang="ts">
  import type { Snippet } from 'svelte';
  import { placeAnchored, placeBeside } from '../lib/popover';

  /**
   * Il foglietto che si apre accanto a qualcosa.
   *
   * Sei posti ne aprivano uno e sei volte era scritto lo stesso pezzo di
   * codice: dove metterlo, come si chiude con Esc, come si chiude cliccando
   * fuori, e l'animazione con cui entra. Sei copie della stessa cosa
   * cominciano a divergere il giorno che qualcuno ne corregge una sola — e
   * nel frattempo tre si chiudevano toccando fuori e tre no.
   *
   * Qui c'è il guscio e basta: la posizione, i due modi di chiudersi e il
   * vetro. Quello che ci va dentro lo sa chi lo apre.
   */
  let {
    anchor,
    width,
    height,
    onclose,
    place = 'anchored',
    id,
    role,
    label,
    children,
  }: {
    /** Il tasto che l'ha aperto: il foglietto gli sta accanto e non lo chiude. */
    anchor: HTMLElement;
    /** Quanto è largo e quanto è alto, per decidere da che parte aprirsi. */
    width: number;
    height: number;
    onclose: () => void;
    /**
     * `anchored` sotto al tasto, `beside` di fianco alla scheda quando c'è
     * spazio — che è quello che serve a un foglietto aperto dentro un pannello,
     * per non coprire il modulo che si sta compilando.
     */
    place?: 'anchored' | 'beside';
    /** Un nome, per chi deve ritrovarlo da fuori. */
    id?: string;
    /** Quando è una domanda e non un elenco, l'assistenza vocale deve saperlo. */
    role?: string;
    label?: string;
    children: Snippet;
  } = $props();

  /**
   * Segue il suo tasto.
   *
   * La pagina sotto può scorrere — dentro un elenco, o tutta intera — e il
   * foglietto restava sospeso a mezz'aria, staccato da quello che l'aveva
   * fatto nascere. E se quel tasto esce di vista il foglietto si chiude,
   * perché una domanda senza il suo oggetto non si capisce.
   */
  let segue = $state(0);
  const at = $derived.by(() => {
    segue;
    return place === 'beside' ? placeBeside(anchor, width, height) : placeAnchored(anchor, width, height);
  });

  $effect(() => {
    const guarda = (): void => {
      const box = anchor.getBoundingClientRect();
      const sparito = !anchor.isConnected || box.bottom < 0 || box.top > window.innerHeight;
      if (sparito) onclose();
      else segue += 1;
    };

    // in cattura, se no gli scorrimenti dentro a un elenco non si sentono
    window.addEventListener('scroll', guarda, true);
    window.addEventListener('resize', guarda);
    return () => {
      window.removeEventListener('scroll', guarda, true);
      window.removeEventListener('resize', guarda);
    };
  });

  /**
   * Un clic fuori chiude, ma non quello sul tasto che l'ha aperto: quello sta
   * già dicendo «chiudimi» per conto suo, e chiuderlo due volte lo
   * riaprirebbe.
   */
  function elsewhere(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-pop]') || anchor.contains(target)) return;
    onclose();
  }
</script>

<svelte:window
  onkeydown={(event: KeyboardEvent) => event.key === 'Escape' && onclose()}
  onpointerdown={elsewhere}
/>

<div
  {id}
  {role}
  data-pop
  class="surface pop"
  aria-label={label}
  style:left="{at.left}px"
  style:top="{at.top}px"
  style:width="{width}px"
>
  {@render children()}
</div>

<style>
  .pop {
    position: fixed;
    z-index: var(--z-popover);
    /* lo spazio intorno a quello che ci sta dentro lo mette il guscio: un
       foglietto senza un nome suo non deve restare senza */
    padding: 9px;
    animation: rise 0.16s var(--ease);
  }
</style>
