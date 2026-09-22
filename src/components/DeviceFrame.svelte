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
   * Il fotogramma si chiede a mano, non lasciando fare al browser.
   *
   * Con un `src` che cambia, quando qualcosa non va resta un'immagine rotta a
   * schermo e il motivo non arriva mai: il server lo scrive nel corpo della
   * risposta, e di quel corpo un <img> non sa che farsene. «Non è arrivata»
   * era tutto quello che si poteva dire, e non è niente. Chiedendola qui, il
   * motivo si legge e si scrive — e l'ultimo fotogramma buono resta al suo
   * posto invece di essere sostituito da un quadrato vuoto.
   */
  async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;

    try {
      const response = await fetch(`/api/devices/${device.id}/frame`, { cache: 'no-store' });
      if (!response.ok) {
        const said = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
        failing = said?.error || (device.online ? 'Non è arrivata' : 'Non risponde');
        return;
      }

      const older = src;
      src = URL.createObjectURL(await response.blob());
      if (older) URL.revokeObjectURL(older);

      failing = '';
      at = new Date();
      lastMs = Date.now();
    } catch {
      failing = 'Non è arrivata';
    } finally {
      loading = false;
    }
  }

  // L'ultima immagine tiene occupata una fetta di memoria finché qualcuno non
  // la lascia andare: uscendo dalla pagina non ci sarebbe più nessuno.
  $effect(() => () => {
    if (src) URL.revokeObjectURL(src);
  });

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
  <!-- O l'immagine, o il motivo per cui non c'è: mai tutti e due, che era il
       modo di occupare il doppio dello spazio per dire mezza cosa. -->
  {#if src}
    <img {src} alt={`Ultima immagine da ${device.name}`} />
  {:else}
    <span class="waiting">{failing || 'Un momento: sto chiedendo un fotogramma…'}</span>
  {/if}

  <div class="foot">
    <!-- Il motivo si scrive una volta sola: se non c'è ancora nessuna
         immagine lo dice il riquadro, e ripeterlo qui sotto sarebbe la stessa
         frase due volte. Con un'immagine vecchia davanti, invece, qui è
         l'unico posto dove dirlo. -->
    <span class="when">
      {#if failing && at}{failing}{:else if at}delle {quando}{:else}&nbsp;{/if}
    </span>
    <Button look="icon" size="sm" title="Aggiorna adesso" disabled={loading} onclick={refresh}>
      <Icon name="refresh" />
    </Button>
  </div>
</div>

<style>
  .cam {
    /* Il letto di un'immagine e' scuro in tutti e due i temi: una telecamera
       riprende quello che c'e', e quello che c'e' di notte e' buio. Legarlo
       al colore del testo voleva dire un riquadro bianco al buio. */
    --shot-bed: #12161c;
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
    background: var(--shot-bed);
    transition: opacity 0.2s;
  }

  .cam.is-waiting img { opacity: 0.6; }

  /* la prima attesa: al posto dell'immagine, non sopra, se no si legge male */
  .waiting {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    border-radius: var(--r-sm);
    background: var(--shot-bed);
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
