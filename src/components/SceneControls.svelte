<script lang="ts">
  import type { Snippet } from 'svelte';
  import { devices, type Scene } from '../lib/devices.svelte';
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
   * Se quel dispositivo risponde adesso.
   *
   * In testa c'era un punto esclamativo che diceva che qualcosa non
   * rispondeva, e non serviva a niente: la domanda vera è «quale?», e la
   * risposta era in un suggerimento che su un telefono non si apre nemmeno.
   * Si dice sulla riga di chi non risponde, che è dove si guarda.
   */
  const answers = (deviceId: string): boolean =>
    devices.list.find((device) => device.id === deviceId)?.online !== false;
  const busy = $derived(devices.busy.includes(`scena:${scene.id}`));

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

<div class="set" class:is-off={!live} class:is-busy={busy}>
  <div class="set-head">
    <span class="set-name">{scene.name}</span>
    {@render trail?.()}

    <!-- un triangolo e non la parola «parti»: quello che fa un tasto del
         genere si sa già, e scritto sembrava un'etichetta da leggere -->
    <Button
      look="play"
      title={busy ? 'Sta partendo' : `Fai partire «${scene.name}»`}
      disabled={!scene.steps.length || !live || busy}
      onclick={ask}
    >
      <Icon name="play" />
    </Button>
  </div>

  {#if scene.steps.length}
    <ul class="steps">
      {#each scene.steps as step, at (`${step.deviceId}:${step.code}:${at}`)}
        {@const says = devices.saysOf(step)}
        <!-- di fila e non incolonnate a destra: l'azione staccata sul bordo
             sembrava un tasto da premere, e invece si legge e basta -->
        <li class:is-mute={!answers(step.deviceId)}>
          {says.who} · <b>{says.what}</b>
          {#if !answers(step.deviceId)}<span class="mute">non risponde</span>{/if}
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
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }

  .steps li {
    min-width: 0;
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .steps b { font-weight: 560; color: var(--ink-2); }

  /* la riga di chi non risponde lo dice da sé: così si sa quale delle due
     tende sta per non muoversi, che è l'unica cosa che si voleva sapere */
  .steps li.is-mute, .steps li.is-mute b { color: var(--warn); }

  .mute {
    margin-left: 6px;
    font-size: 11px;
    color: var(--warn);
    opacity: 0.85;
  }

  .set-none { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }
</style>
