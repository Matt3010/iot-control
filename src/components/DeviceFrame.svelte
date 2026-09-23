<script lang="ts">
  import type { Device } from '../lib/devices.svelte';
  import Button from './Button.svelte';
  import CameraSheet from './CameraSheet.svelte';
  import Icon from './Icon.svelte';

  /**
   * Quello che si vede da una telecamera.
   *
   * Mentre la guardi è una diretta: il flusso resta aperto a casa e i
   * fotogrammi arrivano da soli, dentro una risposta sola che il browser sa
   * già disegnare — niente lettori, niente codec.
   *
   * Se la diretta non parte si ripiega sulle fotografie, una ogni cinque
   * secondi: è più lenta, ma è la strada che funziona sempre. Meglio un
   * riquadro che si aggiorna piano di uno che resta vuoto.
   *
   * In tutti e due i casi si chiede solo mentre qualcuno guarda davvero: card
   * fuori schermo o scheda in secondo piano, non parte niente. Un flusso
   * aperto per nessuno costa banda a casa di qualcuno e un cuore di macchina.
   */
  let { device }: { device: Device } = $props();

  /** Ogni quanto si rifà la fotografia, quando si è ripiegati su quelle. */
  const OGNI_MS = 5000;

  /**
   * Quanto si dà alla diretta per farsi vedere. Il primo fotogramma costa:
   * il flusso va aperto e bisogna aspettare un fotogramma chiave, che su un
   * registratore passa ogni pochi secondi. Ma se non arriva nemmeno dopo
   * questo, è meglio una fotografia lenta di un riquadro scuro per sempre.
   */
  const ASPETTA_MS = 12_000;

  let box = $state<HTMLDivElement | undefined>();
  let shown = $state<HTMLImageElement | undefined>();
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
   * A tutto schermo.
   *
   * Un riquadro da quattro centimetri su un telefono non serve a niente: di
   * una telecamera si guarda un dettaglio, e il dettaglio in piccolo non c'e'.
   *
   * Si apre come finestra di sistema — `showModal` — e non come un riquadro
   * grande: cosi' sta sopra a tutto senza dipendere da dove si trovava nella
   * pagina, si chiude con Esc, e su un telefono copre davvero lo schermo.
   */
  let full = $state(false);
  /**
   * E quando quella grande ha disegnato il primo fotogramma, la piccola si
   * ferma: sono due richieste della stessa cosa, e tenerle aperte tutte e due
   * vorrebbe dire il doppio della banda per guardare una sola immagine. Ci si
   * ferma dopo, non prima, se no in mezzo resta un buco nero.
   */
  let fullReady = $state(false);

  /**
   * Se la diretta è stata chiesta.
   *
   * Non parte da sola. Una telecamera che si accende perché sei passato di
   * lì tiene aperto un flusso a casa e spinge due megabit al secondo su
   * per l'upload di casa, per un'immagine che magari non stavi guardando.
   * Quello che si vede senza chiedere niente è una fotografia sola, presa
   * quando la carta è comparsa; il resto si preme.
   */
  let asked = $state(false);

  /** La diretta è aperta adesso. */
  let live = $state(false);
  /** Vero appena la diretta ha disegnato qualcosa: prima è solo una promessa. */
  let flowing = $state(false);
  const liveUrl = $derived(`/api/devices/${device.id}/live`);

  /**
   * Smettendo di guardare, l'ultimo fotogramma della diretta diventa la
   * fotografia ferma.
   *
   * Non e' un vezzo: togliere l'immagine dalla pagina non basta a far
   * chiudere la diretta — il browser si tiene la presa aperta chissa' quanto,
   * e di la' resta un flusso acceso per nessuno. Cambiarle indirizzo invece
   * la chiude subito, e tanto vale metterci dentro quello che si stava
   * guardando: resta a schermo, e non costa una richiesta.
   */
  function freeze(): void {
    const img = shown;
    if (!img?.naturalWidth) return;

    try {
      const tela = document.createElement('canvas');
      tela.width = img.naturalWidth;
      tela.height = img.naturalHeight;
      tela.getContext('2d')?.drawImage(img, 0, 0);

      const older = src;
      src = tela.toDataURL('image/jpeg', 0.7);
      if (older.startsWith('blob:')) URL.revokeObjectURL(older);
      at = new Date();
      lastMs = Date.now();
    } catch {
      // se non si riesce, pazienza: resta l'ultima fotografia di prima
    }
  }
  /**
   * La diretta non ce l'ha fatta, e per questa telecamera non si ritenta:
   * riprovarla ogni volta che guardi vorrebbe dire aspettare ogni volta lo
   * stesso mezzo minuto per sapere la stessa cosa. Ricaricando si riparte.
   */
  let noLive = $state(false);

  /**
   * La fotografia si chiede a mano, non lasciando fare al browser.
   *
   * Con un `src` che cambia, quando qualcosa non va resta un'immagine rotta a
   * schermo e il motivo non arriva mai: il server lo scrive nel corpo della
   * risposta, e di quel corpo un <img> non sa che farsene.
   */
  async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;

    try {
      const response = await fetch(`/api/devices/${device.id}/frame`, { cache: 'no-store' });
      if (!response.ok) {
        const said = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
        failing = said?.error || (device.online ? 'L’immagine non è arrivata' : 'La telecamera non risponde');
        return;
      }

      const older = src;
      src = URL.createObjectURL(await response.blob());
      if (older) URL.revokeObjectURL(older);

      failing = '';
      at = new Date();
      lastMs = Date.now();
    } catch {
      failing = 'L’immagine non è arrivata';
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

  /**
   * La diretta, finché la guardi. Smettendo, l'indirizzo sparisce: è quello
   * che chiude la risposta, e chiudere la risposta è quello che fa spegnere
   * il flusso a casa.
   */
  $effect(() => {
    if (!asked || !seen || noLive || fullReady) {
      live = false;
      return;
    }

    live = true;
    flowing = false;

    // Una diretta che non comincia non dà nessun segno: non fallisce, non
    // arriva, sta. L'unico modo di accorgersene è guardare l'orologio.
    const pazienza = setTimeout(() => {
      if (flowing) return;
      noLive = true;
      live = false;
    }, ASPETTA_MS);

    return () => {
      clearTimeout(pazienza);
      // prima si ferma quello che si vede, poi si lascia la presa
      freeze();
      live = false;
    };
  });

  /**
   * Una fotografia, non un battito.
   *
   * Quando la carta compare se ne chiede una, se quella che c'è è vecchia:
   * serve a sapere cosa si sta guardando prima di decidere se guardarlo
   * davvero. Poi basta — se ne vuoi un'altra c'è il tasto, e se vuoi vedere
   * muoversi c'è il play.
   */
  $effect(() => {
    if (!seen || live) return;
    if (Date.now() - lastMs >= OGNI_MS) void refresh();
  });

  const quando = $derived(
    at ? at.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
  );
</script>

<div class="cam" bind:this={box} class:is-waiting={loading && !at}>
  <!-- O l'immagine, o il motivo per cui non c'è: mai tutti e due, che era il
       modo di occupare il doppio dello spazio per dire mezza cosa. -->
  {#if live || src}
    <!-- Un elemento solo, che cambia indirizzo: e' cambiare indirizzo a
         chiudere la diretta, mentre toglierlo di mezzo la lascia aperta. -->
    <img
      bind:this={shown}
      src={live ? liveUrl : src}
      alt={live ? `Diretta da ${device.name}` : `Ultima immagine da ${device.name}`}
      onload={() => {
        if (!live) return;
        flowing = true;
        failing = '';
        at = new Date();
        lastMs = Date.now();
      }}
      onerror={() => {
        if (!live) return;
        // La diretta è caduta o non è mai partita: si torna alle fotografie,
        // che è peggio ma è qualcosa.
        noLive = true;
        live = false;
      }}
    />
  {:else}
    <span class="waiting">{failing || 'Un momento, sto chiedendo un fotogramma…'}</span>
  {/if}

  <!-- Il play sta sopra l'immagine, al centro: è il gesto che ci si aspetta
       davanti a una fotografia ferma, e dice anche che ferma lo è.
       Solo sopra un'immagine, però: sopra una frase — «sto chiedendo un
       fotogramma», «questo agente non è collegato» — si sovrapponeva alle
       parole, e un tasto in mezzo a una frase non è né un tasto né una
       frase. Se non c'è niente da guardare non c'è niente da far partire, e
       per riprovare c'è il tasto qui sotto. -->
  {#if !live && !noLive && src}
    <button
      type="button"
      class="play"
      title="Guarda in diretta"
      aria-label="Guarda in diretta"
      onclick={() => (asked = true)}
    >
      <Icon name="play" />
    </button>
  {/if}

  <div class="foot">
    <!-- Il motivo si scrive una volta sola: se non c'è ancora nessuna
         immagine lo dice il riquadro, e ripeterlo qui sotto sarebbe la stessa
         frase due volte. Con un'immagine vecchia davanti, invece, qui è
         l'unico posto dove dirlo. -->
    <span class="when">
      {#if live && at}<i class="now"></i> in diretta
      {:else if failing && at}{failing}
      {:else if at}delle {quando}
      {:else}&nbsp;{/if}
    </span>
    <span class="acts">
      {#if live}
        <!-- Fermarla è quello che fa smettere di arrivare: finché scorre,
             scorre anche l'upload di casa. -->
        <Button look="icon" size="sm" title="Ferma la diretta" onclick={() => (asked = false)}>
          <Icon name="pause" />
        </Button>
      {:else}
        <Button look="icon" size="sm" title="Aggiorna adesso" disabled={loading} onclick={refresh}>
          <Icon name="refresh" />
        </Button>
      {/if}
      <Button look="icon" size="sm" title="A tutto schermo" onclick={() => {
          full = true;
          fullReady = false;
        }}>
        <Icon name="full" />
      </Button>
    </span>
  </div>
</div>

{#if full}
  <CameraSheet
    name={device.name}
    src={noLive ? src : liveUrl}
    onready={() => (fullReady = true)}
    onclose={() => {
      full = false;
      fullReady = false;
    }}
  />
{/if}

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

  /* il play: grande abbastanza da premerlo col pollice, e scuro sotto, che
     su un'inquadratura chiara un cerchio bianco sparisce */
  .play {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.5);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    color: #fff;
    cursor: pointer;
    transition: transform 0.15s var(--ease), background 0.2s;
  }

  .play:hover { background: rgb(0 0 0 / 0.65); transform: translate(-50%, -50%) scale(1.06); }

  .play :global(.ico) { width: 20px; height: 20px; margin-left: 2px; fill: currentColor; }

  .acts {
    display: flex;
    align-items: center;
    gap: 2px;
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

  /* il pallino della diretta: piccolo, rosso, e non lampeggia — una cosa che
     lampeggia in un angolo la si guarda invece di guardare l'immagine */
  .now {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 3px;
    border-radius: 50%;
    background: var(--danger);
    vertical-align: middle;
  }
</style>
