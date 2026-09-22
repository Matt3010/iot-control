<script lang="ts">
  import { devices, type Device, type Scene, type SceneStep } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { Capability } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import AddRow from './AddRow.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import SceneControls from './SceneControls.svelte';

  /**
   * Le scene, dall'inizio alla fine: le fai qui, qui scrivi cosa succede
   * quando partono, e qui poi le premi.
   *
   * Una scena non appartiene a un agente: «sera» può chiudere le tende di
   * sotto e accendere una luce di sopra, e domani toccare due case. Per
   * questo sta di fianco agli agenti e non dentro a uno.
   */
  let newName = $state('');
  /** Quale si sta scrivendo: una per volta, se no è un muro di chip. */
  let editing = $state<string | null>(null);
  /** E dentro quella, per quale dispositivo si sta scegliendo l'azione. */
  let picking = $state<string | null>(null);

  const all = $derived(devices.list);

  /** Cosa porta via eliminarla: niente. I dispositivi restano dove sono. */
  const takesAway = (scene: Scene): string =>
    scene.steps.length
      ? 'I dispositivi restano dove sono: se ne va solo quello che facevano insieme.'
      : 'È vuota: non porta via niente.';

  async function create(name: string) {
    try {
      const made = await devices.createScene(name, []);
      newName = '';
      // appena nata è vuota, e la cosa da fare è riempirla: si apre da sé
      editing = made.id;
      picking = null;
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  /** Le azioni che un dispositivo sa fare, come righe già pronte da aggiungere. */
  function choices(device: Device): { what: string; step: SceneStep }[] {
    const out: { what: string; step: SceneStep }[] = [];
    for (const capability of device.capabilities as Capability[]) {
      if (capability.kind === 'switch') {
        out.push({ what: 'Accendi', step: { deviceId: device.id, code: capability.code, value: true } });
        out.push({ what: 'Spegni', step: { deviceId: device.id, code: capability.code, value: false } });
      } else if (capability.kind === 'enum') {
        for (const value of capability.values) {
          out.push({ what: value, step: { deviceId: device.id, code: capability.code, value } });
        }
      } else if (capability.kind === 'range') {
        // i valori tondi: una scena non si scrive al pixel
        for (const quota of [0, 25, 50, 75, 100]) {
          const value = Math.round(capability.min + ((capability.max - capability.min) * quota) / 100);
          out.push({
            what: `${capability.label} ${value}${capability.unit ?? ''}`,
            step: { deviceId: device.id, code: capability.code, value },
          });
        }
      }
    }
    return out;
  }

  const add = (scene: Scene, step: SceneStep) =>
    void devices.patchScene(scene, { steps: [...scene.steps, step] });

  const drop = (scene: Scene, at: number) =>
    void devices.patchScene(scene, { steps: scene.steps.filter((_step, index) => index !== at) });
</script>

<section class="stack">
  <div class="head">
    <span class="eyebrow">Scene</span>
    {#if devices.scenes.length}
      <span class="how-many">{devices.scenes.length}</span>
    {/if}
  </div>
  <p class="lead">
    Più cose che partono insieme, ognuna con la sua azione: «sera» chiude le tende e accende
    l’abat-jour. Premerle a mano una per volta si vede — partono a mezzo secondo di distanza.
  </p>

  {#each devices.scenes as scene (scene.id)}
    <div class="one">
      <SceneControls {scene} />

      <div class="feet">
        <Button
          look="link"
          size="sm"
          onclick={() => {
            editing = editing === scene.id ? null : scene.id;
            picking = null;
          }}
        >
          {editing === scene.id ? 'Chiudi' : 'Cosa fa'}
        </Button>
        <Button
          look="icon"
          tone="danger"
          extra="kill"
          title="Elimina scena"
          onclick={(event: MouseEvent) =>
            ui.askSure(event.currentTarget as HTMLElement, {
              title: `Eliminare “${scene.name}”?`,
              detail: takesAway(scene),
              verb: 'Elimina',
              onYes: () => void devices.removeScene(scene),
            })}
        >
          <Icon name="trash" />
        </Button>
      </div>

      {#if editing === scene.id}
        <div class="pick">
          <input
            class="rename"
            type="text"
            maxlength="40"
            value={scene.name}
            aria-label="Nome della scena"
            onchange={(event) => void devices.patchScene(scene, { name: event.currentTarget.value })}
          />

          {#if scene.steps.length}
            <ul class="written">
              {#each scene.steps as step, at (`${step.deviceId}:${step.code}:${at}`)}
                {@const says = devices.saysOf(step)}
                <li>
                  <span class="line">{says.who} · <b>{says.what}</b></span>
                  <button
                    type="button"
                    class="drop"
                    title="Togli questa riga"
                    aria-label={`Togli ${says.who} ${says.what}`}
                    onclick={() => drop(scene, at)}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          {#if all.length}
            <!-- prima chi, poi cosa: due passi corti invece di un elenco
                 lungo quanto tutti i dispositivi per tutte le loro azioni -->
            <span class="eyebrow">Aggiungi una riga</span>
            <div class="chips">
              {#each all as device (device.id)}
                <Chip
                  label={device.name}
                  size="sm"
                  look={picking === device.id ? 'sel' : 'off'}
                  title={device.online ? 'Risponde' : 'Adesso non risponde'}
                  onclick={() => (picking = picking === device.id ? null : device.id)}
                />
              {/each}
            </div>

            {#if picking}
              {@const device = all.find((one) => one.id === picking)}
              {#if device}
                {@const able = choices(device)}
                {#if able.length}
                  <div class="chips is-what">
                    {#each able as choice (choice.what)}
                      <Chip
                        label={choice.what}
                        size="sm"
                        look="on"
                        onclick={() => add(scene, choice.step)}
                      />
                    {/each}
                  </div>
                {:else}
                  <p class="lead">«{device.name}» si legge e basta: non c’è niente da fargli fare.</p>
                {/if}
              {/if}
            {/if}
          {:else}
            <p class="lead">Non c’è ancora nessun dispositivo da mettere in scena.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  <AddRow
    placeholder="Nome scena — es. Sera"
    title="Crea scena"
    bind:value={newName}
    onadd={create}
  />
</section>

<style>
  .stack { display: grid; gap: 10px; min-width: 0; }

  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }

  .how-many { font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--ink-3); }

  .lead { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-3); }

  .one { display: grid; gap: 6px; min-width: 0; }

  /* i comandi della scena stanno sotto la sua card, non dentro: dentro c'è
     quello che si preme tutti i giorni, qui quello che si fa una volta */
  .feet { display: flex; align-items: center; justify-content: space-between; gap: 8px; }

  .pick {
    display: grid;
    gap: 8px;
    padding: 10px;
    border-radius: var(--r-md);
    border: 1px dashed var(--hairline);
  }

  .rename { width: 100%; padding: 6px 8px; font-size: 13px; font-weight: 560; }

  .written { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }

  .written li { display: flex; align-items: center; gap: 4px; min-width: 0; }

  .line {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .line b { font-weight: 600; color: var(--ink-2); }

  /* la ✕ sta sempre, smorta: un comando che si scopre solo passandoci sopra
     non si scopre */
  .drop {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--ink-3);
    opacity: 0.5;
    cursor: pointer;
    transition: opacity 0.16s, background 0.16s, color 0.16s;
  }

  .written li:hover .drop, .drop:hover, .drop:focus-visible { opacity: 1; }

  .drop:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }

  .drop :global(.ico) { width: 12px; height: 12px; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  /* le azioni del dispositivo scelto: rientrate, così si vede che sono sue */
  .chips.is-what {
    padding-left: 10px;
    border-left: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
</style>
