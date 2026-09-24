<script lang="ts">
  import type { Snippet } from 'svelte';
  import { devices, type Scene } from '../lib/devices.svelte';
  import type { Salute } from '../lib/health';
  import { quante } from '../lib/condizioni';
  import { fraseCondizione, fraseDiProva } from '../lib/prove';
  import { saysWait, saysWhen } from '../lib/timing';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Alert from './Alert.svelte';
  import StepRail from './StepRail.svelte';

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
   * A che punto è, se sta partendo adesso.
   *
   * Lo dice il server mentre la esegue, quindi si vede anche se l'ha premuta
   * qualcun altro da un altro telefono — ed è l'unica cosa che distingue una
   * scena lenta da una scena che non è partita.
   */
  const corre = $derived(devices.running[scene.id]);

  /** Le righe come le vuole la linea del tempo: chi, cosa, come sta, e l'attesa. */
  /*
   * A quale momento appartiene ogni riga. Il server conta i momenti — le
   * righe che partono insieme, fino alla prossima attesa — e non le righe:
   * confrontarlo con la posizione della riga faceva battere la prima di un
   * momento e mai le altre, e «Mansarda» restava spenta mentre partiva.
   */
  const momentoDi = $derived.by(() => {
    let momento = 1;
    return scene.steps.map((step, at) => (at > 0 && (step.after ?? 0) > 0 ? ++momento : momento));
  });

  const rails = $derived(
    scene.steps
      .map((step, at) => {
        const momento = momentoDi[at] ?? 1;
        const says = devices.saysOf(step);
        const sta =
          step.notify !== undefined || step.scene
            ? { state: 'live' as const, says: step.scene ? 'Fa partire un’altra scena' : 'Manda un avviso' }
            : how(step.deviceId as string);
        return {
          key: `${step.deviceId ?? step.scene ?? 'avviso'}:${step.code ?? ''}:${at}`,
          who: says.who,
          what: says.what,
          talk: step.notify !== undefined || !!step.scene,
          call: !!step.scene,
          wait: step.after,
          state: sta.state,
          says: sta.says,
          now: corre?.at === momento,
          done: !!corre && corre.at > momento,
          // l'attesa di questa riga, se è quella che sta passando adesso
          fino: corre?.at === momento && (step.after ?? 0) > 0 ? corre.fino : undefined,
          vuota: step.notify === '',
        };
      })
      // una riga che deve ancora dire qualcosa non si mostra: quando parte
      // non avvisa nessuno, e qui sembrerebbe una riga vuota
      .filter((step) => !step.vuota),
  );

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
  const how = (deviceId: string): Salute => devices.saluteDi(devices.list.find((one) => one.id === deviceId));

  const busy = $derived(devices.busy.includes(`scena:${scene.id}`));

  /*
   * Cosa succede premendo, contato per quello che è: i dispositivi si
   * muovono, gli avvisi si mandano, le scene si fanno partire. Contarle
   * tutte come «cose» mosse diceva «muove 3 cose» di una scena che manda
   * tre avvisi.
   */
  function cosaFa(): string {
    const avvisi = scene.steps.filter((step) => !!step.notify).length;
    const chiamate = scene.steps.filter((step) => !!step.scene).length;
    const parti = [
      members.length ? `muove ${members.length === 1 ? 'un dispositivo' : `${members.length} dispositivi`}` : '',
      avvisi ? `manda ${avvisi === 1 ? 'un avviso' : `${avvisi} avvisi`}` : '',
      chiamate ? `fa partire ${chiamate === 1 ? 'un’altra scena' : `altre ${chiamate} scene`}` : '',
    ].filter(Boolean);
    if (!parti.length) return 'Non fa ancora niente.';

    const frase = parti.length > 1 ? `${parti.slice(0, -1).join(', ')} e ${parti.at(-1)}` : parti[0]!;
    const zitti = mute ? ` ${mute === 1 ? 'Uno dei dispositivi non risponde' : `${mute} dispositivi non rispondono`}.` : '';
    return `${frase[0]!.toUpperCase()}${frase.slice(1)}.${zitti}`;
  }

  /**
   * Niente parte senza un sì, come per un dispositivo solo — e qui ancora di
   * più: quello che si muove è più d'uno, e magari in stanze dove non sei.
   */
  function ask(event: MouseEvent): void {
    if (busy || !live) return;
    ui.askSure(event.currentTarget as HTMLElement, {
      title: `Far partire «${scene.name}»?`,
      detail: cosaFa(),
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

  <!-- ferma dal fusibile: prima di tutto il resto, perché finché non la
       tocchi l'orario e le partenze qui sotto non valgono -->
  {#if scene.blownAt}
    <Alert
      message="Ferma, perché ripartiva da sola di continuo. Riparte quando la cambi o la fai partire a mano."
    />
  {/if}

  <!-- A che punto è non si scrive qui: lo dice la linea qui sotto, che si
       colora fin dove è arrivata e batte sul passo di adesso. Contarli in
       cima voleva dire leggere «passo 2 di 2» e poi cercare da soli quale
       fosse la seconda riga.

       Se invece parte da sola lo dice qui, senza doverla aprire: e' la
       differenza fra una scena che aspetta te e una che va avanti per conto
       suo. -->
  {#if scene.when}
    <p class="auto" class:is-off={scene.when.off}>
      <Icon name="refresh" />
      <span class="detto">
        {scene.when.off ? `sospesa — ${saysWhen(scene.when)}` : saysWhen(scene.when)}
      </span>
    </p>
  {/if}
  <!-- le cose di casa che la fanno partire, e le condizioni in fila sotto:
       chi guarda la scheda chiusa deve sapere perché partirà da sola -->
  {#each scene.triggers ?? [] as trigger, at (trigger.id ?? at)}
    <p class="auto">
      <Icon name="bell" />
      <span class="detto">quando {fraseDiProva(devices.list, trigger, 'quando')}</span>
    </p>
  {/each}
  <!-- solo quando parte da sola davvero: con l'orario sospeso e niente
       dal quale partire le condizioni non servono a niente, e lo dice
       anche il passo che le scrive -->
  {#if scene.only && quante(scene.only) && ((scene.when && !scene.when.off) || (scene.triggers ?? []).length)}
    <p class="auto is-se">
      <span class="detto">solo se {fraseCondizione(devices.list, scene.only)}</span>
    </p>
  {/if}

  {#if scene.steps.length}
    <StepRail steps={rails}>
      {#snippet row(step: (typeof rails)[number])}
        {#if step.call}
          <!-- una riga che ne chiama un'altra: il nome della scena in chiaro,
               che e' l'unica cosa che serve sapere -->
          <span class="riga">poi <b>{step.what}</b></span>
        {:else if step.talk}
          <!-- niente icona: che sia una riga diversa lo dice gia' il nodo
               vuoto sulla linea, e che siano parole lo dicono le virgolette -->
          <span class="riga">«{step.what}»</span>
        {:else}
          <span class="riga">
            <!-- il punto separa due cose: senza la seconda non separa niente -->
            {step.who}{#if step.what} · <b>{step.what}</b>{/if}
            <!-- per il guasto vero anche l'icona, come nella scheda del
                 dispositivo: il colore del nodo da solo non basta a chi non
                 lo distingue -->
            {#if step.state === 'lost'}<span class="away" title={step.says}><Icon name="alert" /></span>{/if}
          </span>
        {/if}
      {/snippet}
    </StepRail>
  {:else}
    <p class="set-none">Non c’è ancora niente dentro. Le righe si aggiungono con la matita qui sopra.</p>
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

  /* la riga di una scena: il nome di chi si muove davanti, l'azione in
     chiaro */
  .riga {
    display: block;
    min-width: 0;
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .riga b { font-weight: 560; color: var(--ink-2); }

  .away { display: inline-grid; place-items: center; color: var(--danger); }

  .away :global(.ico) { width: 12px; height: 12px; vertical-align: -2px; }

  .set-none { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }

  /* l'orario che ha, se parte da sola: piccolo, sotto il nome, e smorto
     quando è sospeso */
  .auto {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -2px 0 0;
    font-size: 11.5px;
    line-height: 1.3;
    color: var(--ink-3);
  }

  /* l'icona sta in mezzo alla riga e non sulla sua prima lettera */
  .auto :global(.ico) {
    flex: none;
    width: 12px;
    height: 12px;
  }

  .auto.is-off { opacity: 0.55; }

  /* barrato solo il testo, non il segno davanti */
  .auto.is-off .detto { text-decoration: line-through; }
</style>
