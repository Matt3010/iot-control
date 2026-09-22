<script lang="ts">
  import type { Device } from '../lib/devices.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Quello che si vede da una telecamera.
   *
   * Non è un video: è una fotografia che si rifà ogni pochi secondi. Ogni
   * fotogramma è una domanda che attraversa il filo fino a casa, e là dentro
   * Home Assistant deve aspettare un fotogramma chiave prima di poter
   * disegnare qualcosa — sui registratori ne passa uno ogni pochi secondi.
   * Chiederne sessanta al secondo sarebbe chiederne cinquantacinque che non
   * esistono.
   *
   * E si chiede solo mentre qualcuno guarda davvero: se la card è fuori
   * schermo o la scheda del browser è in secondo piano, non parte niente.
   */
  let { device }: { device: Device } = $props();

  /** Ogni quanto si rifà, mentre lo stai guardando. */
  const OGNI_MS = 5000;

  let box = $state<HTMLDivElement | undefined>();
  let src = $state('');
  let at = $state<Date | null>(null);
  /**
   * Lo stesso istante, ma fuori dalla reattività: serve a decidere se un
   * fotogramma è vecchio, e leggerlo dentro all'effetto lo farebbe ripartire
   * a ogni immagine che arriva.
   */
  let lastMs = 0;
  let failing = $state('');
  let loading = $state(false);
  /**
   * Due cose diverse, tenute separate apposta: essere sullo schermo e avere
   * la scheda in primo piano. Mescolarle in un flag solo vuol dire che,
   * tornando sulla scheda, non si riaccende più niente — l'osservatore non
   * ha motivo di parlare, perché sullo schermo era e sullo schermo è rimasto.
   */
  let onScreen = $state(false);
  let awake = $state(true);
  const seen = $derived(onScreen && awake);

  /**
   * Un indirizzo nuovo a ogni giro, se no il browser riuserebbe quello di
   * prima: è la stessa richiesta, e una telecamera ferma sarebbe indistinguibile
   * da una telecamera che non risponde più.
   */
  function refresh(): void {
    if (loading) return;
    loading = true;
    src = `/api/devices/${device.id}/frame?t=${Date.now()}`;
  }

  $effect(() => {
    if (!box) return;

    const guarda = new IntersectionObserver(
      ([entry]) => (onScreen = !!entry?.isIntersecting),
      { threshold: 0.15 },
    );
    guarda.observe(box);

    awake = !document.hidden;
    const sveglia = () => (awake = !document.hidden);
    document.addEventListener('visibilitychange', sveglia);

    return () => {
      guarda.disconnect();
      document.removeEventListener('visibilitychange', sveglia);
    };
  });

  $effect(() => {
    if (!seen) return;

    // Tornando a guardarla se ne chiede uno subito, se l'ultimo è vecchio:
    // restare cinque secondi davanti a un'immagine di un minuto fa è peggio
    // che non averla, perché sembra adesso e non lo è.
    if (Date.now() - lastMs >= OGNI_MS) refresh();

    const battito = setInterval(refresh, OGNI_MS);
    return () => clearInterval(battito);
  });

  const quando = $derived(
    at ? at.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
  );
</script>

<div class="cam" bind:this={box} class:is-waiting={loading && !at}>
  {#if src}
    <img
      {src}
      alt={`Ultima immagine da ${device.name}`}
      onload={() => {
        loading = false;
        failing = '';
        at = new Date();
        lastMs = Date.now();
      }}
      onerror={() => {
        loading = false;
        failing = device.online ? 'Non è arrivata' : 'Non risponde';
      }}
    />
  {/if}

  {#if !at}
    <span class="waiting">{failing || 'Un momento: sto chiedendo un fotogramma…'}</span>
  {/if}

  <div class="foot">
    <span class="when">
      {#if failing}{failing}{:else if at}delle {quando}{:else}&nbsp;{/if}
    </span>
    <Button look="icon" size="sm" title="Aggiorna adesso" disabled={loading} onclick={refresh}>
      <Icon name="refresh" />
    </Button>
  </div>
</div>

<style>
  .cam {
    position: relative;
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--ink) 85%, transparent);
    transition: opacity 0.2s;
  }

  .cam.is-waiting img { opacity: 0.6; }

  /* la prima attesa: al posto dell'immagine, non sopra, se no si legge male */
  .waiting {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--ink) 85%, transparent);
    color: rgb(255 255 255 / 0.7);
    font-size: 11.5px;
    text-align: center;
    padding: 0 12px;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  /* l'ora del fotogramma: è l'unica cosa che distingue una telecamera ferma
     da una telecamera che ha smesso di rispondere */
  .when {
    min-width: 0;
    font-size: 11px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
