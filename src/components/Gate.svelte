<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import MapBackdrop from './MapBackdrop.svelte';

  /**
   * La porta: una scheda sola in mezzo, con la mappa dietro come paesaggio.
   *
   * Esiste perché le porte sono due, quella per entrare e quella di un link
   * d'invito, e devono sembrare la stessa: chi arriva da un invito e poi
   * entra non deve avere l'impressione di aver cambiato sito a metà strada.
   * Il contenuto lo mette chi la usa. Se c'è `onsubmit` la scheda è un
   * modulo, così l'invio da tastiera funziona senza che nessuno ci pensi.
   */
  let {
    title,
    lead,
    onsubmit,
    children,
  }: {
    title: string;
    /** Le righe sotto al titolo: perché sei qui, cosa serve. */
    lead?: Snippet;
    onsubmit?: (event: SubmitEvent) => void;
    children: Snippet;
  } = $props();
</script>

<div class="gate">
  <MapBackdrop />

  <svelte:element this={onsubmit ? 'form' : 'div'} class="route surface" {onsubmit}>
    <header class="route-head">
      <span class="wordmark"><Icon name="pin" /> Place Index</span>
      <h1>{title}</h1>
      {#if lead}<p>{@render lead()}</p>{/if}
    </header>

    {@render children()}
  </svelte:element>
</div>

<style>
  .gate {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    overflow: hidden;
  }

  /* la mappa dietro resta un paesaggio: si guarda, non si tocca */
  .gate::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(120% 90% at 50% 40%, rgb(var(--base) / 0.1), rgb(var(--base) / 0.72));
    pointer-events: none;
  }

  .route {
    position: relative;
    z-index: 1;
    width: min(420px, 100%);
    padding: 22px 22px 20px;
    display: grid;
    gap: 18px;
    animation: rise 0.45s var(--ease);
  }

  .route-head { display: grid; gap: 6px; }

  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 620;
    letter-spacing: -0.01em;
    color: var(--ink-3);
  }

  .wordmark :global(.ico) { width: 15px; height: 15px; }

  h1 {
    margin: 2px 0 0;
    font-size: 22px;
    font-weight: 640;
    letter-spacing: -0.028em;
  }

  .route-head p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--ink-3);
  }

  .route-head p :global(b) { font-weight: 600; color: var(--ink-2); }

  /* il tasto grande in fondo, quello che fa andare avanti */
  .route :global(.go) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 18px;
    font-size: 14.5px;
  }

  .route :global(.go .ico) { width: 17px; height: 17px; }
  .route :global(.go:disabled) { opacity: 0.6; }

  @media (max-width: 600px) {
    .route { padding: 18px; }
    h1 { font-size: 20px; }
  }
</style>
