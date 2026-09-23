<script lang="ts">
  import { devices, type Device, type Scene, type SceneStep } from '../lib/devices.svelte';
  import type { Capability } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import SceneControls from './SceneControls.svelte';

  /**
   * Una scena, tutta in una scheda.
   *
   * Stavano tutte impilate dentro un riquadro solo, e non si capiva piu' dove
   * finisse una e cominciasse l'altra: il tasto che la fa partire, le sue
   * righe e il cestino sembravano tre elenchi paralleli invece che tre pezzi
   * della stessa cosa. Una scheda per scena, come per gli agenti.
   *
   * Dentro c'e' quello che si preme tutti i giorni; sotto, quello che si fa
   * una volta sola — scrivere cosa succede quando parte, e buttarla via.
   */
  let { scene }: { scene: Scene } = $props();

  /** Se si sta scrivendo cosa fa. Chiusa, perche' non e' quello che si viene a fare. */
  let open = $state(false);
  /** E per quale dispositivo si sta scegliendo l'azione. */
  let picking = $state<string | null>(null);

  const all = $derived(devices.list);

  /** Cosa porta via eliminarla, che e' niente. I dispositivi restano dove sono. */
  const takesAway = (): string =>
    scene.steps.length
      ? 'I dispositivi restano dove sono. Se ne va solo quello che facevano insieme.'
      : 'È vuota e non porta via niente.';

  /** Le azioni che un dispositivo sa fare, come righe gia' pronte da aggiungere. */
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
        // i valori tondi, perche' una scena non si scrive al pixel
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

  /**
   * Aggiunge una riga, o cambia quella che c'era per la stessa cosa.
   *
   * «Apri» e «ferma» sulla stessa tenda sono una scena che non vuol dire
   * niente: partirebbero a mezzo secondo l'una dall'altra e la tenda
   * resterebbe dove capita. Due righe sullo stesso dispositivo restano
   * legittime quando parlano di cose diverse — una lampadina che si accende e
   * si porta al 30% — e quelle non si toccano.
   */
  function add(step: SceneStep): void {
    const stessa = (one: SceneStep) => one.deviceId === step.deviceId && one.code === step.code;
    // al suo posto e non in fondo: cambiare idea su una riga non deve
    // rimescolare l'ordine in cui si legge la scena
    const steps = scene.steps.some(stessa)
      ? scene.steps.map((one) => (stessa(one) ? step : one))
      : [...scene.steps, step];
    void devices.patchScene(scene, { steps });
  }

  /** Cosa fa già quel dispositivo in questa scena, capacità per capacità. */
  const already = (deviceId: string, code: string) =>
    scene.steps.find((one) => one.deviceId === deviceId && one.code === code)?.value;

  /** Se è già in scena: la pastiglia lo dice invece di farlo scoprire premendo. */
  const inScene = (deviceId: string) => scene.steps.some((one) => one.deviceId === deviceId);

  const drop = (at: number) =>
    void devices.patchScene(scene, { steps: scene.steps.filter((_step, index) => index !== at) });
</script>

<SceneControls {scene}>
  {#snippet trail()}
    <Button
      look="icon"
      title={open ? 'Chiudi la modifica' : 'Modifica la scena'}
      onclick={() => {
        open = !open;
        picking = null;
      }}
    >
      <Icon name={open ? 'close' : 'edit'} />
    </Button>
    <Button
      look="icon"
      tone="danger"
      extra="kill"
      title="Elimina scena"
      onclick={(event: MouseEvent) =>
        ui.askSure(event.currentTarget as HTMLElement, {
          title: `Eliminare “${scene.name}”?`,
          detail: takesAway(),
          verb: 'Elimina',
          onYes: () => void devices.removeScene(scene),
        })}
    >
      <Icon name="trash" />
    </Button>
  {/snippet}
</SceneControls>

{#if open}
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
              onclick={() => drop(at)}
            >
              <Icon name="close" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if all.length}
      <!-- prima chi, poi cosa: due passi corti invece di un elenco lungo
           quanto tutti i dispositivi per tutte le loro azioni -->
      <span class="eyebrow">Aggiungi una riga</span>
      <div class="chips">
        {#each all as device (device.id)}
          <Chip
            label={device.name}
            size="sm"
            look={picking === device.id ? 'sel' : inScene(device.id) ? 'on' : 'off'}
            title={inScene(device.id) ? 'È già in questa scena' : device.online ? 'Risponde' : 'Adesso non risponde'}
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
                {@const scelta = already(choice.step.deviceId, choice.step.code) === choice.step.value}
                <!-- quella già scelta si vede: premerne un'altra la sostituisce,
                     invece di aggiungere una riga che la contraddice -->
                <Chip
                  label={choice.what}
                  size="sm"
                  look={scelta ? 'sel' : 'on'}
                  title={scelta ? 'È quello che fa adesso' : undefined}
                  onclick={() => add(choice.step)}
                />
              {/each}
            </div>
          {:else}
            <p class="lead">«{device.name}» si legge e basta, non c’è niente da fargli fare.</p>
          {/if}
        {/if}
      {/if}
    {:else}
      <p class="lead">Non c’è ancora nessun dispositivo da mettere in scena.</p>
    {/if}
  </div>
{/if}

<style>

  .lead { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-3); }

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
