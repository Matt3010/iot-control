<script lang="ts">
  import { devices, type Scene } from '../lib/devices.svelte';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Una scena: più cose che partono insieme, ognuna con la sua.
   *
   * Non finge di essere un dispositivo e non ha un interruttore: non c'è un
   * «acceso» da mostrare, perché due tende possono stare una aperta e una
   * chiusa. C'è un tasto solo — parte — e sotto, a parole, cosa succede
   * quando lo premi. Lo stato vero resta dei dispositivi, ognuno col suo.
   */
  let { scene }: { scene: Scene } = $props();

  const members = $derived(devices.membersOf(scene));
  const live = $derived(devices.reachable(scene));
  /** Quanti non rispondono: si dice, perché una scena può partire a metà. */
  const mute = $derived(members.filter((device) => !device.online).length);
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
    <span class="set-mark" aria-hidden="true"><Icon name="layers" /></span>
    <span class="set-name">{scene.name}</span>
    {#if mute}
      <span class="set-away" title={`${mute} non rispond${mute === 1 ? 'e' : 'ono'}`}>
        <Icon name="alert" />
      </span>
    {/if}
    <Button
      look="primary"
      size="sm"
      extra="set-go"
      disabled={!scene.steps.length || !live || busy}
      onclick={ask}
    >
      {busy ? 'Parte…' : 'Parti'}
    </Button>
  </div>

  {#if scene.steps.length}
    <ul class="steps">
      {#each scene.steps as step, at (`${step.deviceId}:${step.code}:${at}`)}
        {@const says = devices.saysOf(step)}
        <li>
          <span class="who">{says.who}</span>
          <span class="what">{says.what}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="set-none">Non c’è ancora niente dentro: aggiungi una riga qui sotto.</p>
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

  .set-mark {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }

  .set-mark :global(.ico) { width: 13px; height: 13px; }

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

  .set-away { display: grid; place-items: center; flex: none; color: var(--danger); }

  .set-away :global(.ico) { width: 14px; height: 14px; }

  /* cosa succede quando parte, riga per riga: una scena si legge per sapere
     cosa muove, e il nome di chi si muove va davanti */
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }

  .steps li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .who {
    min-width: 0;
    font-size: 12px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .what { flex: none; font-size: 12px; font-weight: 560; color: var(--ink); }

  .set-none { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }
</style>
