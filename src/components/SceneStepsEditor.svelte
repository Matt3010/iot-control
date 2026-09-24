<script lang="ts">
  import { devices, type Device, type Scene, type SceneStep } from '../lib/devices.svelte';
  import { ATTESE, saysWait } from '../lib/timing';
  import type { Capability } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import PickField from './PickField.svelte';
  import TextField from './TextField.svelte';

  /**
   * Il primo passo di una scena: come si chiama e cosa fa, riga per riga.
   *
   * Un pezzo suo e non una parte della scheda: la scena si salva a ogni
   * riga, e questo pezzo non sa di essere un passo di un wizard.
   */
  let { scene }: { scene: Scene } = $props();

  /** Per quale dispositivo si sta scegliendo l'azione. */
  let picking = $state<string | null>(null);

  const all = $derived(devices.list);

  /** Le azioni che un dispositivo sa fare, come righe gia' pronte da aggiungere. */
  function choices(device: Device): { what: string; step: SceneStep }[] {
    const out: { what: string; step: SceneStep }[] = [];
    for (const capability of device.capabilities as Capability[]) {
      if (capability.kind === 'switch' && capability.pulse) {
        // a impulso si preme e basta, e si spegne da solo
        out.push({ what: 'Premi', step: { deviceId: device.id, code: capability.code, value: true } });
      } else if (capability.kind === 'switch') {
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

    /*
     * Le righe dell'ultimo momento sono quelle che partirebbero insieme a
     * questa: dopo l'ultima attesa non c'è più niente che le separi.
     */
    const dopoAttesa = scene.steps.map((one) => one.after ?? 0).lastIndexOf(0) === 0
      ? 0
      : scene.steps.reduce((at, one, index) => ((one.after ?? 0) > 0 ? index : at), 0);
    const insieme = scene.steps.slice(dopoAttesa);

    // Cambiare idea su una riga che non è ancora partita la corregge al suo
    // posto; rimetterla in un momento diverso invece è un'altra riga, e
    // quella nasce con un'attesa, se no sarebbero due ordini contrari
    // nello stesso istante.
    if (insieme.some(stessa)) {
      const steps = scene.steps.map((one) =>
        one === insieme.find(stessa) ? { ...step, ...(one.after ? { after: one.after } : {}) } : one,
      );
      void devices.patchScene(scene, { steps });
      return;
    }

    const ripete = scene.steps.some(stessa);
    void devices.patchScene(scene, {
      steps: [...scene.steps, { ...step, ...(ripete ? { after: 30 } : {}) }],
    });
  }

  /**
   * Una riga che non muove niente: manda un avviso.
   *
   * È l'unica azione che non riguarda una cosa in casa, e per ora l'unica
   * che non sia un comando. Nasce con delle parole già dentro, perché un
   * campo vuoto in mezzo a una sequenza non dice cosa farsene.
   */
  function addNotify(): void {
    /*
     * Nasce senza parole.
     *
     * Una frase scritta da noi — «la scena «X» è partita» — è una frase
     * nostra messa in bocca a qualcun altro: la meta' delle volte non è
     * quello che voleva dire, e cancellarla prima di scrivere la sua è
     * lavoro in più. Il campo vuoto con scritto cosa farci è più onesto.
     */
    void devices.patchScene(scene, { steps: [...scene.steps, { notify: '' }] });
  }

  /** Le altre scene che si possono chiamare da qui. */
  const altre = $derived(
    devices.scenes.filter((one) => one.id !== scene.id).map((one) => ({ id: one.id, label: one.name })),
  );

  /**
   * Una riga che fa partire un'altra scena.
   *
   * «Buonanotte» può chiamare «chiudi tutto» e aggiungerci due cose sue,
   * invece di ricopiarne le righe: quando «chiudi tutto» cambia, cambia
   * anche dentro l'altra. Se l'anello si chiude — quella riporta a questa —
   * il server rifiuta, e qui si vede il perché.
   */
  function addScene(id: string): void {
    void devices.patchScene(scene, { steps: [...scene.steps, { scene: id }] });
  }

  /** Le parole di quell'avviso, cambiate mentre si scrivono. */
  function setNotify(at: number, testo: string): void {
    const steps = scene.steps.map((one, index) => (index === at ? { ...one, notify: testo } : one));
    void devices.patchScene(scene, { steps });
  }

  /**
   * Sposta una riga di un posto, su o giù.
   *
   * L'attesa viaggia con la riga, perché è sua: «parte cinque secondi dopo
   * quella sopra» resta vero anche se sopra c'è un'altra riga. La prima però
   * non ha un «prima», quindi chi finisce in cima perde la sua attesa.
   */
  function move(at: number, verso: -1 | 1): void {
    const dove = at + verso;
    if (dove < 0 || dove >= scene.steps.length) return;

    const steps = [...scene.steps];
    const preso = steps[at] as SceneStep;
    steps[at] = steps[dove] as SceneStep;
    steps[dove] = preso;

    const primo = steps[0] as SceneStep;
    if (primo.after) steps[0] = { ...primo, after: undefined };

    void devices.patchScene(scene, { steps });
  }

  /** Quanto si aspetta prima di quella riga. Zero vuol dire insieme alla precedente. */
  function setWait(at: number, seconds: number): void {
    const steps = scene.steps.map((one, index) =>
      index === at ? { ...one, ...(seconds ? { after: seconds } : { after: undefined }) } : one,
    );
    void devices.patchScene(scene, { steps });
  }

  /** L'elenco delle attese, per il foglietto che le fa scegliere. */
  const attese = ATTESE.map((seconds) => ({ id: String(seconds), label: saysWait(seconds) }));

  /** Cosa fa già quel dispositivo in questa scena, capacità per capacità. */
  const already = (deviceId: string | undefined, code: string | undefined) =>
    scene.steps.find((one) => one.deviceId === deviceId && one.code === code)?.value;

  /** Se è già in scena: la pastiglia lo dice invece di farlo scoprire premendo. */
  const inScene = (deviceId: string) => scene.steps.some((one) => one.deviceId === deviceId);

  const drop = (at: number) =>
    void devices.patchScene(scene, { steps: scene.steps.filter((_step, index) => index !== at) });
</script>

  <TextField
    value={scene.name}
    label="Nome della scena"
    maxlength={40}
    onchange={(nome: string) => void devices.patchScene(scene, { name: nome })}
  />

  {#if scene.steps.length}
    <ul class="written">
      {#each scene.steps as step, at (`${step.deviceId}:${step.code}:${at}`)}
        {@const says = devices.saysOf(step)}
        <li class:is-talk={!!step.notify}>
          <!-- l'attesa prima di questa riga: la prima non ha un «prima» -->
          {#if at > 0}
            <PickField
              look="pill"
              value={String(step.after ?? 0)}
              options={attese}
              label="Quando parte questa riga"
              title="Quando parte questa riga?"
              onpick={(scelto: string) => setWait(at, Number(scelto))}
            />
          {/if}
          {#if step.notify !== undefined}
            <!-- le parole si scrivono qui: un avviso senza le sue parole
                 non si puo' nemmeno immaginare -->
            <TextField
              value={step.notify}
              size="sm"
              label="Cosa dice l'avviso"
              placeholder="Cosa vuoi che dica"
              onchange={(testo: string) => setNotify(at, testo)}
            />
          {:else}
            <span class="line">{says.who}{#if says.what} · <b>{says.what}</b>{/if}</span>
          {/if}
          <!-- su e giù: l'ordine di una sequenza e' la sequenza, e senza
               questi per spostare una riga bisognava rifare le altre -->
          <Button
            look="icon"
            size="sm"
            extra="sposta"
            title="Spostala su"
            disabled={at === 0}
            onclick={() => move(at, -1)}
          >
            <Icon name="collapse" />
          </Button>
          <Button
            look="icon"
            size="sm"
            extra="sposta"
            title="Spostala giù"
            disabled={at === scene.steps.length - 1}
            onclick={() => move(at, 1)}
          >
            <Icon name="expand" />
          </Button>
          <Button
            look="icon"
            size="sm"
            tone="danger"
            extra="drop"
            title="Togli questa riga"
            aria-label={`Togli ${says.who} ${says.what}`}
            onclick={() => drop(at)}
          >
            <Icon name="close" />
          </Button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if all.length}
    <!-- prima chi, poi cosa: due passi corti invece di un elenco lungo
         quanto tutti i dispositivi per tutte le loro azioni -->
    <div class="parte">
      <span class="eyebrow">Aggiungi una riga</span>
    </div>
    <div class="chips">
      <!-- l'unica azione che non riguarda una cosa in casa: sta con le
           altre perche' si aggiunge allo stesso modo -->
      <!-- le altre pastiglie sono nomi di cose, questa e' quello che fa: dirlo
           all'infinito la distingue da un dispositivo che si chiama «Avviso» -->
      <Chip
        label="Invia un avviso"
        size="sm"
        look="off"
        title="Manda un avviso quando la scena arriva qui"
        onclick={addNotify}
      />
      {#if altre.length}
        <Chip
          label="Fai partire una scena"
          size="sm"
          look="off"
          extra="pick-btn"
          title="Fa partire un'altra scena, da qui"
          onclick={(event: MouseEvent) =>
            ui.askPick(event.currentTarget as HTMLElement, {
              title: 'Quale scena?',
              options: altre,
              onPick: addScene,
            })}
        />
      {/if}
      {#each all as device (device.id)}
        <Chip
          label={device.name}
          size="sm"
          look={picking === device.id ? 'sel' : inScene(device.id) ? 'on' : 'off'}
          salute={devices.saluteDi(device)}
          title={inScene(device.id) ? 'È già in questa scena' : devices.saluteDi(device).says}
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

<style>
  .lead { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-3); }

  .written { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }

  .written li { display: flex; align-items: center; gap: 4px; min-width: 0; }

  /* il campo di un avviso prende la riga, e la pastiglia dell'attesa gli sta
     accanto alla stessa altezza */
  .written li :global(.text-field) { flex: 1; min-width: 0; }


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

  /* la crocetta sta sempre, smorta: un comando che si scopre solo passandoci
     sopra non si scopre */
  .written :global(.drop), .written :global(.sposta) {
    width: 24px;
    height: 26px;
    opacity: 0.4;
    transition: opacity 0.16s;
  }

  .written li:hover :global(.drop),
  .written li:hover :global(.sposta),
  .written :global(.drop:hover),
  .written :global(.sposta:hover) { opacity: 1; }

  .written :global(.sposta:disabled) { opacity: 0.12; }

  .written :global(.sposta .ico) { width: 12px; height: 12px; }

  .parte {
    margin-top: 3px;
    padding-top: 11px;
    border-top: 1px solid var(--hairline);
  }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  /* le azioni del dispositivo scelto: rientrate, così si vede che sono sue */
  .chips.is-what {
    padding-left: 10px;
    border-left: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
</style>
