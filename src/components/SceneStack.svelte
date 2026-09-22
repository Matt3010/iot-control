<script lang="ts">
  import { devices, type Device, type Scene } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import AddRow from './AddRow.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import SceneControls from './SceneControls.svelte';

  /**
   * Gli insiemi, dall'inizio alla fine: li fai qui, qui scegli chi ci sta
   * dentro, e qui poi li premi.
   *
   * Un insieme non appartiene a un agente: «apri tutte le tende» può voler
   * dire due tende in due stanze, e domani due case. Per questo sta di fianco
   * agli agenti e non dentro a uno.
   */
  let newName = $state('');
  /** Quale si sta componendo: si aprono uno per volta, se no è un muro di chip. */
  let editing = $state<string | null>(null);

  const all = $derived(devices.list);

  /** Cosa porta via eliminarlo: niente. I dispositivi restano dove sono. */
  const takesAway = (scene: Scene): string =>
    scene.deviceIds.length
      ? `${scene.deviceIds.length === 1 ? 'Il dispositivo resta' : 'I dispositivi restano'} dove ${scene.deviceIds.length === 1 ? 'è' : 'sono'}: se ne va solo il nome.`
      : 'È vuoto: non porta via niente.';

  async function create(name: string) {
    try {
      const made = await devices.createScene(name, []);
      newName = '';
      // appena nato è vuoto, e la cosa da fare è riempirlo: si apre da sé
      editing = made.id;
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  function toggle(scene: Scene, device: Device) {
    const held = scene.deviceIds.includes(device.id);
    void devices.patchScene(scene, {
      deviceIds: held
        ? scene.deviceIds.filter((id) => id !== device.id)
        : [...scene.deviceIds, device.id],
    });
  }
</script>

<section class="stack">
  <div class="head">
    <span class="eyebrow">Insiemi</span>
    {#if devices.scenes.length}
      <span class="how-many">{devices.scenes.length}</span>
    {/if}
  </div>
  <p class="lead">
    Più dispositivi che rispondono a un colpo solo: «apri le tende» sono due tende, e premerle una
    per volta si vede. Un insieme mostra soltanto quello che sanno fare <b>tutti</b> quelli che ci
    stanno dentro.
  </p>

  {#each devices.scenes as scene (scene.id)}
    <div class="one">
      <SceneControls {scene} />

      <div class="feet">
        <Button
          look="link"
          size="sm"
          onclick={() => (editing = editing === scene.id ? null : scene.id)}
        >
          {editing === scene.id ? 'Chiudi' : 'Chi ci sta dentro'}
        </Button>
        <Button
          look="icon"
          tone="danger"
          extra="kill"
          title="Elimina insieme"
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
            aria-label="Nome dell’insieme"
            onchange={(event) => void devices.patchScene(scene, { name: event.currentTarget.value })}
          />
          {#if all.length}
            <div class="chips">
              {#each all as device (device.id)}
                <Chip
                  label={device.name}
                  size="sm"
                  look={scene.deviceIds.includes(device.id) ? 'sel' : 'off'}
                  title={device.online ? 'Risponde' : 'Adesso non risponde'}
                  onclick={() => toggle(scene, device)}
                />
              {/each}
            </div>
          {:else}
            <p class="lead">Non c’è ancora nessun dispositivo da metterci dentro.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  <AddRow
    placeholder="Nome insieme — es. Tende"
    title="Crea insieme"
    bind:value={newName}
    onadd={create}
  />
</section>

<style>
  .stack { display: grid; gap: 10px; min-width: 0; }

  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }

  .how-many { font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--ink-3); }

  .lead { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-3); }

  .lead b { font-weight: 600; color: var(--ink-2); }

  .one { display: grid; gap: 6px; min-width: 0; }

  /* i comandi dell'insieme stanno sotto la sua card, non dentro: dentro c'è
     quello che si preme tutti i giorni, qui quello che si fa una volta */
  .feet { display: flex; align-items: center; justify-content: space-between; gap: 8px; }

  .pick {
    display: grid;
    gap: 8px;
    padding: 10px;
    border-radius: var(--r-md);
    border: 1px dashed var(--hairline);
  }

  .rename {
    width: 100%;
    padding: 6px 8px;
    font-size: 13px;
    font-weight: 560;
  }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
