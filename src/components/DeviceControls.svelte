<script lang="ts">
  import { devices, type Device } from '../lib/devices.svelte';
  import type { Capability, DeviceValue } from '../lib/types';
  import Chip from './Chip.svelte';
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
</script>

<div class="dev" class:is-lit={lit} class:is-off={!device.online}>
  <div class="dev-head">
    <span class="dev-dot" aria-hidden="true"></span>
    <span class="dev-name">{device.name}</span>
    {#if !device.online}
      <span class="dev-away">non raggiungibile</span>
    {/if}
  </div>

  <div class="dev-body">
    {#each device.capabilities as capability (capability.code)}
      {#if capability.kind === 'switch'}
        <div class="line" class:is-busy={devices.isBusy(device.id, capability.code)}>
          <Switch
            checked={device.state[capability.code] === true}
            disabled={!device.online}
            label={capability.label}
            onchange={(value) => devices.command(device, capability.code, value)}
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
                label={value}
                look={device.state[capability.code] === value ? 'sel' : 'off'}
                disabled={!device.online}
                onclick={() => devices.command(device, capability.code, value)}
              />
            {/each}
          </span>
        </div>
      {:else}
        <div class="line sensor">
          <span class="line-name">{capability.label}</span>
          <span class="reading">
            {sensorText(capability.code)}{#if capability.unit}<i>{capability.unit}</i>{/if}
          </span>
        </div>
      {/if}
    {/each}
  </div>
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

  .dev-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
    transition: background 0.22s, box-shadow 0.22s;
  }

  .dev.is-lit .dev-dot {
    background: var(--lit);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lit) 22%, transparent);
  }

  .dev.is-off .dev-dot { background: var(--ink-3); box-shadow: none; }

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
    flex: none;
    font-size: 11px;
    color: var(--ink-3);
    white-space: nowrap;
  }

  /* i controlli ------------------------------------------------------------ */

  .dev-body { display: grid; gap: 9px; }

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

  .choices :global(.chip) { height: 26px; padding: 0 10px; font-size: 11.5px; }

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
