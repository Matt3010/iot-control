<script lang="ts">
  import { devices, type Scene } from '../lib/devices.svelte';
  import type { Capability } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';

  /**
   * Un insieme: più dispositivi che rispondono a un colpo solo.
   *
   * Non finge di essere un dispositivo. Non dice «acceso», perché due tende
   * possono stare una aperta e una chiusa e non esiste una parola sola per
   * quello stato; dice chi c'è dentro e cosa si può chiedergli. Lo stato vero
   * resta dei dispositivi, ognuno con il suo.
   */
  let { scene }: { scene: Scene } = $props();

  const members = $derived(devices.membersOf(scene));
  const actions = $derived(devices.actionsOf(scene));
  const live = $derived(devices.reachable(scene));
  /** Quanti non rispondono: si dice, perché un insieme parte a metà. */
  const mute = $derived(members.filter((device) => !device.online).length);

  const busy = (code: string) => devices.busy.includes(`${scene.id}:${code}`);

  /**
   * Niente parte senza un sì, come per un dispositivo solo — e qui ancora di
   * più: quello che si muove è più d'uno, e magari in stanze dove non sei.
   */
  function confirm(anchor: HTMLElement, verb: string, run: () => void): void {
    const quanti = members.length === 1 ? 'un dispositivo' : `${members.length} dispositivi`;
    ui.askSure(anchor, {
      title: `${verb} «${scene.name}»?`,
      detail: `Parte su ${quanti}${mute ? `, ma ${mute} non rispond${mute === 1 ? 'e' : 'ono'}` : ''}.`,
      verb,
      tone: 'plain',
      no: 'Annulla',
      onYes: run,
    });
  }

  function askSwitch(event: MouseEvent, capability: Capability, on: boolean): void {
    event.preventDefault();
    if (busy(capability.code)) return;
    confirm(event.currentTarget as HTMLElement, on ? 'Accendi' : 'Spegni', () =>
      void devices.runScene(scene, capability.code, on),
    );
  }
</script>

<div class="set" class:is-off={!live}>
  <div class="set-head">
    <span class="set-mark" aria-hidden="true"><Icon name="layers" /></span>
    <span class="set-name">{scene.name}</span>
    {#if mute}
      <span class="set-away" title={`${mute} non rispond${mute === 1 ? 'e' : 'ono'}`}>
        <Icon name="alert" />
      </span>
    {/if}
  </div>

  <div class="set-who">
    {#if members.length}
      {members.map((device) => device.name).join(' · ')}
    {:else}
      Non c’è ancora niente dentro.
    {/if}
  </div>

  {#if actions.length}
    <div class="set-body">
      {#each actions as capability (capability.code)}
        {#if capability.kind === 'switch'}
          <!-- Il clic si ferma qui: lo Switch non arriva a cambiare, e questo
               riquadro è anche l'ancora a cui si attacca la domanda. Un
               insieme non ha un «acceso» suo, quindi la levetta parte spenta
               e serve solo a dire da che parte stai premendo. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="row" class:is-busy={busy(capability.code)}>
            <span class="row-what">{capability.label}</span>
            <span class="pair">
              <Chip
                label="Spegni"
                look="off"
                size="sm"
                disabled={!live || busy(capability.code)}
                onclick={(event: MouseEvent) => askSwitch(event, capability, false)}
              />
              <Chip
                label="Accendi"
                look="off"
                size="sm"
                disabled={!live || busy(capability.code)}
                onclick={(event: MouseEvent) => askSwitch(event, capability, true)}
              />
            </span>
          </div>
        {:else if capability.kind === 'enum'}
          <div class="row" class:is-busy={busy(capability.code)}>
            <span class="row-what">{capability.label}</span>
            <span class="pair">
              {#each capability.values as value (value)}
                <Chip
                  label={value}
                  look="off"
                  size="sm"
                  disabled={!live || busy(capability.code)}
                  onclick={(event: MouseEvent) =>
                    confirm(event.currentTarget as HTMLElement, value, () =>
                      void devices.runScene(scene, capability.code, value),
                    )}
                />
              {/each}
            </span>
          </div>
        {/if}
      {/each}
    </div>
  {:else if members.length}
    <p class="set-none">
      Questi non hanno niente in comune da fare insieme. Un insieme mostra solo quello che sanno
      fare <b>tutti</b>.
    </p>
  {/if}
</div>

<style>
  .set {
    display: grid;
    gap: 8px;
    padding: 11px 12px 12px;
    border-radius: var(--r-md);
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
  }

  .set.is-off { opacity: 0.6; }

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

  /* chi c'è dentro, smorzato: è un promemoria, non un elenco da leggere */
  .set-who {
    font-size: 11px;
    line-height: 1.45;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .set-body { display: grid; gap: 7px; }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    transition: opacity 0.16s;
  }

  .row.is-busy { opacity: 0.55; pointer-events: none; }

  .row-what { font-size: 12px; font-weight: 540; color: var(--ink-2); }

  .pair { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }

  .set-none { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }

  .set-none b { font-weight: 600; color: var(--ink-2); }
</style>
