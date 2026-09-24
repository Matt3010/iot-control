<script lang="ts">
  import { numero } from '../lib/prove';
  import HealthDot from './HealthDot.svelte';
  import { devices, type Device } from '../lib/devices.svelte';
  import type { Capability, DeviceValue } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Chip from './Chip.svelte';
  import DeviceFrame from './DeviceFrame.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';

  /**
   * I controlli di una cosa che si accende, disegnati da quello che quella cosa
   * dice di saper fare. Qui dentro non c'è una parola di domotica: un `switch`
   * è un interruttore, un `range` è un cursore, un `sensor` è un numero che si
   * guarda. Un dispositivo nuovo non chiede una riga nuova.
   *
   * È una riga dentro la card del suo agente, non una card a sua volta: il
   * vestito — sfondo, bordo, angoli — ce l'ha già chi lo ospita.
   */
  let { device }: { device: Device } = $props();

  const lit = $derived(devices.isOn(device));

  /**
   * Di un dispositivo si sanno tre cose, non due.
   *
   * Verde risponde. Rosso non risponde, e quello è un guasto vero: l'agente
   * c'è, gli ha chiesto di questo, e questo non c'è. Grigio invece vuol dire
   * che non si sa: l'agente non è collegato, e da qui non si può dire niente
   * di una tenda a trenta chilometri. Dipingerla di rosso manda a cercare un
   * guasto in casa quando il filo è caduto per strada.
   */
  const stato = $derived(devices.saluteDi(device));

  /* le capacità di tutti i giorni, e a parte le impostazioni (protocol.d.ts, `setting`) */
  const principali = $derived((device.capabilities as Capability[]).filter((one) => !one.setting));
  const impostazioni = $derived((device.capabilities as Capability[]).filter((one) => one.setting));
  let aperte = $state(false);
  const how = $derived(stato.state);

  const numberOf = (value: DeviceValue | undefined): number => (typeof value === 'number' ? value : 0);

  /** Quello che si legge a destra dell'etichetta, mentre trascini. */
  const readout = (capability: Capability & { kind: 'range' }): string =>
    `${Math.round(numberOf(device.state[capability.code]))}${capability.unit ?? ''}`;

  /** Il valore di un sensore: un numero si arrotonda, una parola resta com'è. */
  function sensorText(code: string): string {
    const value = device.state[code];
    if (typeof value === 'number') return `${Math.round(value * 10) / 10}`;
    if (typeof value === 'boolean') return value ? 'sì' : 'no';
    return value === undefined || value === '' ? '—' : String(value);
  }

  /**
   * Mentre trascini il cursore il numero deve seguire il dito, ma il comando
   * parte una volta sola, quando lasci: una luce non va comandata sessanta
   * volte al secondo.
   */
  function preview(code: string, value: number): void {
    device.state = { ...device.state, [code]: value };
  }

  /**
   * Niente parte senza un sì. Premere qui vuol dire muovere una cosa in un
   * posto dove magari non sei: una tapparella che scende mentre qualcuno ci
   * sta sotto non è un clic qualunque.
   *
   * Il cursore no: quello è una regolazione, la scegli trascinando e la
   * correggi trascinando ancora.
   */
  function confirm(anchor: HTMLElement, title: string, verb: string, run: () => void): void {
    ui.askSure(anchor, { title, verb, tone: 'plain', no: 'Annulla', onYes: run });
  }

  /**
   * Un interruttore si muoverebbe sotto il dito prima che qualcuno dica di sì.
   * Rimetterlo a posto dopo vorrebbe dire riscrivere lo stato, e la lista si
   * ricalcolerebbe sotto la domanda appena aperta — che è come si spostava lo
   * scorrimento. Quindi non si muove affatto: si ferma il clic prima che il
   * quadratino si accorga di essere stato premuto.
   */
  function askSwitch(event: MouseEvent, capability: Capability, current: boolean): void {
    event.preventDefault();
    // finché quello di prima non è finito non si chiede niente: il riquadro è
    // già spento al tocco, ma un clic arrivato un attimo prima passerebbe
    if (devices.isBusy(device.id, capability.code)) return;

    const wanted = !current;

    confirm(
      event.currentTarget as HTMLElement,
      capability.setting
        ? `${wanted ? 'Accendere' : 'Spegnere'} «${capability.label}» di «${device.name}»?`
        : `${wanted ? 'Accendere' : 'Spegnere'} «${device.name}»?`,
      wanted ? 'Accendi' : 'Spegni',
      () => void devices.command(device, capability.code, wanted),
    );
  }
</script>

<div class="dev" class:is-lit={lit} class:is-off={!device.online}>
  <div class="dev-head">
    <!-- il pallino dice se la cosa risponde, non se è accesa: quello lo
         dicono la riga che si scalda e il suo interruttore -->
    <HealthDot salute={stato} />
    <span class="dev-name">{device.name}</span>
    <!-- l'avviso solo per un guasto vero: se è l'agente a mancare, quello lo
         dice già il suo pallino qui sopra, e ripeterlo su ogni riga sarebbe
         una colonna di allarmi per una cosa sola -->
    {#if how === 'lost'}
      <span class="dev-away" title={stato.says}><Icon name="alert" /></span>
    {/if}

  </div>

  <!-- Una riga per capacità, la stessa per quelle di tutti i giorni e per
       le impostazioni: una levetta è una levetta, dovunque stia. -->
  {#snippet controllo(capability: Capability)}
      {#if capability.kind === 'switch' && capability.pulse}
        <!-- A impulso non c'è un acceso da mostrare: torna spento da solo
             dopo mezzo secondo, e quello che comanda cambia a ogni impulso.
             C'è un tasto da premere, e quanto dura l'impulso. -->
        <div class="line choice">
          <span class="line-name">A impulso · {numero(capability.pulse / 1000, 's')}</span>
          <span class="choices">
            <Chip
              label="Premi"
              look="off"
              size="sm"
              disabled={!device.online || devices.isBusy(device.id, capability.code)}
              onclick={(event: MouseEvent) =>
                confirm(
                  event.currentTarget as HTMLElement,
                  `Premere «${device.name}»?`,
                  'Premi',
                  () => void devices.command(device, capability.code, true),
                )}
            />
          </span>
        </div>
      {:else if capability.kind === 'switch'}
        <!-- Il clic si ferma qui: lo Switch non arriva a cambiare, e questo
             riquadro è anche l'ancora a cui si attacca la domanda. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="line"
          class:is-busy={devices.isBusy(device.id, capability.code)}
          onclick={(event: MouseEvent) =>
            device.online && askSwitch(event, capability, device.state[capability.code] === true)}
        >
          <Switch
            checked={device.state[capability.code] === true}
            disabled={!device.online}
            label={capability.label}
            onchange={() => undefined}
          />
        </div>
      {:else if capability.kind === 'range'}
        <div class="line range" class:is-busy={devices.isBusy(device.id, capability.code)}>
          <span class="line-head">
            <span class="line-name">{capability.label}</span>
            <span class="line-value">{readout(capability)}</span>
          </span>
          <input
            type="range"
            aria-label={capability.label}
            min={capability.min}
            max={capability.max}
            step={capability.step}
            disabled={!device.online}
            value={numberOf(device.state[capability.code])}
            style:--fill="{((numberOf(device.state[capability.code]) - capability.min) /
              Math.max(capability.max - capability.min, 1)) *
              100}%"
            oninput={(event) => preview(capability.code, Number(event.currentTarget.value))}
            onchange={(event) => devices.command(device, capability.code, Number(event.currentTarget.value))}
          />
        </div>
      {:else if capability.kind === 'enum'}
        <div class="line" class:is-busy={devices.isBusy(device.id, capability.code)}>
          <span class="line-name">{capability.label}</span>
          <span class="choices">
            {#each capability.values as value (value)}
              <Chip
                label={capability.labels?.[value] ?? value}
                look={device.state[capability.code] === value ? 'sel' : 'off'}
                size="sm"
                disabled={!device.online || devices.isBusy(device.id, capability.code)}
                onclick={(event: MouseEvent) =>
                  confirm(
                    event.currentTarget as HTMLElement,
                    capability.setting
                      ? `Impostare «${capability.label}» a «${capability.labels?.[value] ?? value}»?`
                      : `${value} «${device.name}»?`,
                    capability.labels?.[value] ?? value,
                    () => void devices.command(device, capability.code, value),
                  )}
              />
            {/each}
          </span>
        </div>
      {:else if capability.kind === 'image'}
        <!-- una telecamera non ha una riga di comandi: ha quello che si vede -->
        <DeviceFrame {device} />
      {:else}
        <div class="line sensor">
          <span class="line-name">{capability.label}</span>
          <span class="reading">
            {sensorText(capability.code)}{#if capability.unit}<i>{capability.unit}</i>{/if}
          </span>
        </div>
      {/if}
  {/snippet}

  <div class="dev-body">
    {#each principali as capability (capability.code)}
      {@render controllo(capability)}
    {/each}
  </div>

  <!-- Le impostazioni stanno chiuse: si toccano una volta, e aperte in mezzo
       ai comandi di tutti i giorni si confondono con loro. -->
  {#if impostazioni.length}
    <button type="button" class="dev-more" aria-expanded={aperte} onclick={() => (aperte = !aperte)}>
      <Icon name="expand" />
      Impostazioni
      <span class="dev-more-count">{impostazioni.length}</span>
    </button>
    {#if aperte}
      <div class="dev-body is-settings">
        {#each impostazioni as capability (capability.code)}
          {@render controllo(capability)}
        {/each}
      </div>
    {/if}
  {/if}

</div>

<style>
  /* Il colore dell'acceso: caldo, e diverso dal blu di "dove sei" — in questa
     app un colore vuol dire una cosa sola. */
  .dev {
    --lit: #d98613;
    display: grid;
    gap: 9px;
    padding: 10px 12px 11px;
    transition: background 0.22s, opacity 0.2s;
  }

  @media (prefers-color-scheme: dark) {
    .dev { --lit: #f0b357; }
  }

  /* un filo fra un dispositivo e il successivo: sono righe della stessa card,
     non scatole separate */
  .dev + :global(.dev) { border-top: 1px solid var(--hairline-soft); }

  /* acceso: la riga si scalda appena, quanto basta a vederlo con la coda
     dell'occhio senza che diventi un semaforo */
  .dev.is-lit { background: color-mix(in srgb, var(--lit) 8%, transparent); }

  .dev.is-off { opacity: 0.6; }

  /* il nome ---------------------------------------------------------------- */

  .dev-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .dev-name {
    font-size: 12.5px;
    font-weight: 560;
    letter-spacing: -0.01em;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dev-away {
    margin-left: auto;
    display: grid;
    place-items: center;
    flex: none;
    color: var(--danger);
  }

  .dev-away :global(.ico) { width: 14px; height: 14px; }

  /* i controlli ------------------------------------------------------------ */

  .dev-body { display: grid; gap: 9px; }

  /* il tasto delle impostazioni: piccolo e in disparte, come una nota */
  .dev-more {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    padding: 4px 0;
    border: 0;
    background: none;
    color: var(--ink-3);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }

  .dev-more:hover { color: var(--ink-2); }

  .dev-more :global(.ico) { width: 12px; height: 12px; transition: transform 0.16s; }

  .dev-more[aria-expanded='true'] :global(.ico) { transform: rotate(180deg); }

  .dev-more-count { font-variant-numeric: tabular-nums; }

  /* aperte, si distinguono da sopra con una riga, non con un riquadro */
  .dev-body.is-settings { padding-top: 9px; border-top: 1px solid var(--hairline-soft); }

  .line { display: grid; gap: 6px; }

  /* un comando in volo: il controllo si fa opaco e non si può ripremere.
     L'attesa sta addosso alla cosa che l'ha chiesta, non sulla pagina. */
  .line.is-busy { opacity: 0.55; pointer-events: none; }

  .line-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }

  .line-name { font-size: 12px; font-weight: 540; color: var(--ink-2); }

  .line-value {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 560;
    color: var(--ink);
  }

  .choices { display: flex; flex-wrap: wrap; gap: 5px; }

  /* un sensore si legge e basta: il numero è la cosa grossa, l'unità gli sta
     accanto piccola, come su un quadrante */
  .line.sensor { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }

  .reading {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--ink);
  }

  .reading i {
    margin-left: 2px;
    font-size: 11.5px;
    font-style: normal;
    font-weight: 500;
    color: var(--ink-3);
  }

  /* il cursore ------------------------------------------------------------- */

  .range input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 22px;
    padding: 0;
    background: none;
    border: 0;
    box-shadow: none;
    cursor: pointer;
  }

  .range input[type="range"]:disabled { cursor: default; }

  /* la parte già percorsa si colora: si legge da lontano quanto è accesa */
  .range input[type="range"]::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 99px;
    background: linear-gradient(to right, var(--lit) 0 var(--fill), var(--sunken-hover) var(--fill) 100%);
    box-shadow: inset 0 0 0 1px var(--hairline);
  }

  .range input[type="range"]::-moz-range-track {
    height: 6px;
    border-radius: 99px;
    background: linear-gradient(to right, var(--lit) 0 var(--fill), var(--sunken-hover) var(--fill) 100%);
    box-shadow: inset 0 0 0 1px var(--hairline);
  }

  .range input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -5px;
    border-radius: 50%;
    background: var(--glass-strong);
    box-shadow: var(--shadow-1), 0 0 0 1px var(--hairline);
    transition: transform 0.14s var(--ease);
  }

  .range input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 50%;
    background: var(--glass-strong);
    box-shadow: var(--shadow-1), 0 0 0 1px var(--hairline);
  }

  .range input[type="range"]:active::-webkit-slider-thumb { transform: scale(1.12); }

  .range input[type="range"]:focus-visible { outline: 0; }

  .range input[type="range"]:focus-visible::-webkit-slider-thumb {
    box-shadow: var(--shadow-1), 0 0 0 1px var(--hairline), 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent);
  }
</style>
