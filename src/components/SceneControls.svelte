<script lang="ts">
  import type { Snippet } from 'svelte';
  import { devices, type Scene } from '../lib/devices.svelte';
  import { thingHealth } from '../lib/health';
  import { saysWait, saysWhen } from '../lib/timing';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Una scena: più cose che partono insieme, ognuna con la sua.
   *
   * Non finge di essere un dispositivo e non ha un interruttore, perché non
   * c'è un «acceso» da mostrare: due tende possono stare una aperta e una
   * chiusa. C'è un tasto solo, quello che la fa partire, e sotto, a parole,
   * cosa succede quando lo premi. Lo stato vero resta dei dispositivi.
   */
  let {
    scene,
    trail,
  }: {
    scene: Scene;
    /**
     * Altri tasti nella testata, prima di quello che la fa partire.
     *
     * Stavano in una fascia sotto la scheda, e li' sembravano un secondo
     * elenco: la matita e il cestino riguardano questa scena come il
     * triangolo, e le cose di una cosa stanno insieme.
     */
    trail?: Snippet;
  } = $props();

  const members = $derived(devices.membersOf(scene));
  const live = $derived(devices.reachable(scene));
  /** Quanti non rispondono: si dice, perché una scena può partire a metà. */
  const mute = $derived(members.filter((device) => !device.online).length);

  /**
   * Come sta il dispositivo di una riga, con le stesse tre parole e gli
   * stessi tre colori che ha nella sua scheda.
   *
   * In testa alla scena c'era un punto esclamativo che diceva che qualcosa
   * non rispondeva, e non serviva a niente: la domanda vera è «quale?», e la
   * risposta stava in un suggerimento che su un telefono non si apre nemmeno.
   * Si dice sulla riga, che è dove si guarda — e si dice come altrove, se no
   * la stessa cosa avrebbe due facce a seconda della pagina.
   */
  function how(deviceId: string): { state: 'live' | 'lost' | 'unknown'; says: string } {
    const device = devices.list.find((one) => one.id === deviceId);
    const state = thingHealth(device ? devices.agentUp(device.agentId) : false, device?.online ?? false);
    return {
      state,
      says:
        state === 'live'
          ? 'Raggiungibile'
          : state === 'lost'
            ? 'Non risponde'
            : 'Non si sa, perché l’agente non è collegato',
    };
  }
  const busy = $derived(devices.busy.includes(`scena:${scene.id}`));
  /**
   * A che punto è, se sta partendo adesso.
   *
   * Lo dice il server mentre la esegue, quindi si vede anche se l'ha premuta
   * qualcun altro da un altro telefono — ed è l'unica cosa che distingue una
   * scena lenta da una scena che non è partita.
   */
  const corre = $derived(devices.running[scene.id]);

  /**
   * Niente parte senza un sì, come per un dispositivo solo — e qui ancora di
   * più: quello che si muove è più d'uno, e magari in stanze dove non sei.
   */
  function ask(event: MouseEvent): void {
    if (busy || !live) return;
    const quante = scene.steps.length === 1 ? 'una cosa' : `${scene.steps.length} cose`;
    ui.askSure(event.currentTarget as HTMLElement, {
      title: `Far partire «${scene.name}»?`,
      detail: `Muove ${quante}${mute ? `, ma ${mute} non rispond${mute === 1 ? 'e' : 'ono'}` : ''}.`,
      verb: 'Parti',
      tone: 'plain',
      no: 'Annulla',
      onYes: () => void devices.runScene(scene),
    });
  }
</script>

<div class="set" class:is-off={!live} class:is-busy={busy || !!corre}>
  <div class="set-head">
    <span class="set-name">{scene.name}</span>
    {@render trail?.()}

    <!-- un triangolo e non la parola «parti»: quello che fa un tasto del
         genere si sa già, e scritto sembrava un'etichetta da leggere -->
    <Button
      look="round"
      extra="go"
      title={busy ? 'Sta partendo' : `Fai partire «${scene.name}»`}
      disabled={!scene.steps.length || !live || busy}
      onclick={ask}
    >
      <Icon name="play" />
    </Button>
  </div>

  <!-- se parte da sola lo dice qui, senza doverla aprire: e' la differenza
       fra una scena che aspetta te e una che va avanti per conto suo -->
  {#if corre}
    <p class="corre">
      <span class="battito"></span>
      {corre.of > 1 ? `sta partendo — passo ${corre.at} di ${corre.of}` : 'sta partendo'}
    </p>
  {:else if scene.when}
    <p class="auto" class:is-off={scene.when.off}>
      <Icon name="refresh" />
      {scene.when.off ? `sospesa — ${saysWhen(scene.when)}` : saysWhen(scene.when)}
    </p>
  {/if}

  {#if scene.steps.length}
    <ul class="steps">
      {#each scene.steps as step, at (`${step.deviceId}:${step.code}:${at}`)}
        {@const says = devices.saysOf(step)}
        <!-- di fila e non incolonnate a destra: l'azione staccata sul bordo
             sembrava un tasto da premere, e invece si legge e basta -->
        {@const sta = how(step.deviceId)}
        <li>
          <!-- l'attesa si legge come parte della frase: «dopo un minuto,
               Tenda 1 chiudi» — e su una scena tutta insieme non si vede -->
          {#if step.after}<span class="poi">{saysWait(step.after)},</span>{/if}
          <!-- lo stesso pallino della scheda del dispositivo: verde risponde,
               rosso non risponde, grigio non si sa -->
          <span class="dot is-{sta.state}" role="img" aria-label={sta.says} title={sta.says}></span>
          {says.who} · <b>{says.what}</b>
          <!-- per il guasto vero anche l'icona, come nella scheda del
               dispositivo: il colore da solo non basta a chi non lo distingue -->
          {#if sta.state === 'lost'}<span class="away" title={sta.says}><Icon name="alert" /></span>{/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="set-none">Non c’è ancora niente dentro. Aggiungi una riga qui sotto.</p>
  {/if}
</div>

<style>
  .set {
    display: grid;
    gap: 9px;
    padding: 11px 12px 12px;
    border-radius: var(--r-md);
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
    transition: opacity 0.16s;
  }

  .set.is-off, .set.is-busy { opacity: 0.6; }

  .set-head { display: flex; align-items: center; gap: 8px; min-width: 0; }

  .set-name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* cosa succede quando parte, riga per riga: una scena si legge per sapere
     cosa muove, e il nome di chi si muove va davanti */
  /* il triangolo dentro al cerchio tira a destra: al centro esatto sembra
     storto, ed e' l'unica cosa che questa scheda ha da dire sulla forma */
  .set :global(.go .ico) { margin-left: 1px; fill: currentColor; }

  /* mentre parte: un punto che pulsa e a che passo e' arrivata */
  .corre {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -2px 0 0;
    font-size: 11.5px;
    color: var(--accent);
  }

  .battito {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: battito 1.1s ease-in-out infinite;
  }

  @keyframes battito {
    0%, 100% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1); }
  }

  /* l'orario: piccolo, sotto il nome, e smorto quando e' sospeso */
  .auto {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: -2px 0 0;
    font-size: 11.5px;
    color: var(--ink-3);
  }

  .auto :global(.ico) { width: 12px; height: 12px; }

  .auto.is-off { opacity: 0.55; text-decoration: line-through; }

  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }

  .steps li {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
  }

  .dot.is-lost { background: var(--danger); }

  /* non si sa, perche' l'agente non e' collegato: da qui non si puo' dire
     niente di una tenda a trenta chilometri */
  .dot.is-unknown { background: var(--ink-3); opacity: 0.55; }

  .away { display: inline-grid; place-items: center; flex: none; color: var(--danger); }

  .away :global(.ico) { width: 12px; height: 12px; }

  .steps b { font-weight: 560; color: var(--ink-2); }

  .poi { color: var(--accent); font-variant-numeric: tabular-nums; }


  .set-none { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }
</style>
