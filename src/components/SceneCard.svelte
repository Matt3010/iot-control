<script lang="ts">
  import { devices, type Device, type Scene, type SceneStep, type Timing } from '../lib/devices.svelte';
  import { ATTESE, defaultWhen, GIORNI, saysWait, today } from '../lib/timing';
  import type { Capability } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import SceneControls from './SceneControls.svelte';
  import DateField from './DateField.svelte';
  import Switch from './Switch.svelte';
  import TextField from './TextField.svelte';
  import TimeField from './TimeField.svelte';

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
    void devices.patchScene(scene, {
      /*
       * «La scena» davanti, e il nome fra virgolette. Se la frase si
       * appoggiasse al nome — ««Luci accese» è partita» — bisognerebbe
       * sapere genere e numero di una parola che hai scelto tu, e non si può.
       */
      steps: [...scene.steps, { notify: `La scena «${scene.name}» è partita` }],
    });
  }

  /** Le parole di quell'avviso, cambiate mentre si scrivono. */
  function setNotify(at: number, testo: string): void {
    const steps = scene.steps.map((one, index) => (index === at ? { ...one, notify: testo } : one));
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

  /* ------------------------------------------------------- parte da sola */

  /** Cambia l'orario, o lo toglie del tutto. */
  const setWhen = (when: Timing | null) => void devices.patchScene(scene, { when });

  /**
   * Un giorno si accende o si spegne.
   *
   * Dentro, «nessun giorno» vuol dire tutti — è come si scrive «ogni
   * giorno» — ma sotto il dito non può funzionare così: chi vede sette
   * pastiglie accese e ne preme una si aspetta che quella si spenga, non che
   * resti accesa da sola. Quindi si parte dalla settimana intera. E un giorno
   * ci vuole: un orario che non capita mai non è un orario.
   */
  function flipDay(day: number): void {
    const when = scene.when;
    if (!when) return;

    const TUTTI = [0, 1, 2, 3, 4, 5, 6];
    const adesso = when.days.length ? when.days : TUTTI;
    const dopo = adesso.includes(day)
      ? adesso.filter((one) => one !== day)
      : [...adesso, day].sort((a, b) => a - b);

    if (!dopo.length) return;
    setWhen({ ...when, days: dopo.length === 7 ? [] : dopo });
  }

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
          <li class:is-talk={!!step.notify}>
            <!-- l'attesa prima di questa riga: la prima non ha un «prima» -->
            {#if at > 0}
              <Button
                look="link"
                size="sm"
                extra="pick-btn attesa"
                title="Quando parte questa riga"
                onclick={(event: MouseEvent) =>
                  ui.askPick(event.currentTarget as HTMLElement, {
                    title: 'Quando parte questa riga?',
                    options: attese,
                    current: String(step.after ?? 0),
                    onPick: (scelto: string) => setWait(at, Number(scelto)),
                  })}
              >
                {saysWait(step.after)}
              </Button>
            {/if}
            {#if step.notify}
              <!-- le parole si scrivono qui: un avviso senza le sue parole
                   non si puo' nemmeno immaginare -->
              <TextField
                value={step.notify}
                size="sm"
                label="Cosa dice l'avviso"
                onchange={(testo: string) => setNotify(at, testo)}
              />
            {:else}
              <span class="line">{says.who} · <b>{says.what}</b></span>
            {/if}
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

    <!-- Quando parte da sola. Sta qui e non in una pagina degli orari:
         «chiudi le tende alle 19» e' una cosa sola, e tenerla in due posti
         vorrebbe dire aprirne due per cambiare un numero. -->
    <div class="quando">
      <Switch
        checked={!!scene.when && !scene.when.off}
        label="Parte da sola"
        note={scene.when
          ? scene.when.on
            ? 'Parte una volta sola, e poi l’orario se ne va.'
            : 'Se l’ora è quella, parte anche se non sei in casa.'
          : 'Adesso parte solo quando la premi.'}
        onchange={(acceso: boolean) =>
          setWhen(acceso ? (scene.when ? { ...scene.when, off: false } : defaultWhen()) : scene.when ? { ...scene.when, off: true } : null)}
      />

      {#if scene.when}
        <!-- Ogni settimana o una volta sola sono due cose diverse, non due
             sfumature della stessa: o si ripete o no, e quello che si sceglie
             sotto cambia di conseguenza. -->
        <div class="modo">
          <Chip
            label="Ogni settimana"
            size="sm"
            look={scene.when.on ? 'off' : 'sel'}
            onclick={() => setWhen({ ...scene.when!, on: undefined })}
          />
          <Chip
            label="Una volta"
            size="sm"
            look={scene.when.on ? 'sel' : 'off'}
            onclick={() => setWhen({ ...scene.when!, on: scene.when!.on ?? today() })}
          />
        </div>

        <div class="orario">
          <TimeField
            value={scene.when.at}
            label="A che ora parte"
            onchange={(at: string) => setWhen({ ...scene.when!, at })}
          />
          {#if scene.when.on}
            <DateField
              value={scene.when.on}
              label="In che giorno parte"
              onchange={(on: string) => setWhen({ ...scene.when!, on })}
            />
          {:else}
            <!-- nessun giorno acceso vuol dire tutti: un elenco vuoto si legge
                 male, e «ogni giorno» e' quello che si intende -->
            <div class="giorni">
              {#each GIORNI as label, day (day)}
                <Chip
                  label={label}
                  size="sm"
                  look={!scene.when.days.length || scene.when.days.includes(day) ? 'on' : 'off'}
                  onclick={() => flipDay(day)}
                />
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

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

  .written { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }

  .written li { display: flex; align-items: center; gap: 4px; min-width: 0; }

  /* il campo di un avviso prende la riga, e la pastiglia dell'attesa gli sta
     accanto alla stessa altezza */
  .written li :global(.text-field) { flex: 1; min-width: 0; }

  /* l'attesa sta davanti alla riga e non in una colonna sua: si legge come
     una frase — «dopo 30s, Tenda 1 chiudi» */
  .written :global(.attesa) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    height: 26px;
    min-width: 74px;
    padding: 0 9px;
    border-radius: 99px;
    background: var(--sunken);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

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

  /* Il pannello sono tre cose diverse una sotto l'altra: quello che la scena
     fa, quando parte da sola, e cosa aggiungerci. Senza una riga che le
     separi si leggono come un elenco solo, e il «parte da sola» sembra
     l'ultima delle azioni. */
  .quando {
    display: grid;
    gap: 8px;
    margin-top: 2px;
    padding-top: 11px;
    border-top: 1px solid var(--hairline);
  }

  .parte {
    margin-top: 3px;
    padding-top: 11px;
    border-top: 1px solid var(--hairline);
  }

  .modo { display: flex; gap: 6px; }

  .orario { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

  .giorni { display: flex; flex-wrap: wrap; gap: 4px; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  /* le azioni del dispositivo scelto: rientrate, così si vede che sono sue */
  .chips.is-what {
    padding-left: 10px;
    border-left: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
</style>
