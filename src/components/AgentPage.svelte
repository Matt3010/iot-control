<script lang="ts">
  import { devices, type Agent, type Device } from '../lib/devices.svelte';
  import { AGENTS_PATH } from '../lib/routing';
  import { store } from '../lib/store.svelte';
  import type { Capability } from '../lib/types';
  import DeviceControls from './DeviceControls.svelte';
  import DeviceFrame from './DeviceFrame.svelte';
  import PageShell from './PageShell.svelte';
  import ViewControls from './ViewControls.svelte';
  import { vistaDispositivi } from '../lib/viste.svelte';

  /**
   * Un agente solo, grande.
   *
   * Nell'elenco ogni agente sta in una colonna da trecento pixel, e le sue
   * telecamere sono francobolli uno sotto l'altro: per guardare il cortile
   * bisogna aprirlo a tutto schermo, e mentre lo guardi non vedi più niente
   * del resto. Qui le immagini stanno in fila, grandi, e i comandi sotto —
   * così si guarda chi ha suonato e si apre il cancello senza cambiare
   * pagina.
   */
  let { id }: { id: string } = $props();

  const agent = $derived(devices.agents.find((one) => one.id === id));
  // nello stesso ordine della sua scheda nella pagina degli agenti: la vista
  // è una sola per tutti i dispositivi
  const theirs = $derived(agent ? vistaDispositivi.applica(devices.ofAgent(agent.id)) : []);

  /** Quelle che si guardano, separate da quelle che si premono. */
  const watches = (device: Device): boolean =>
    (device.capabilities as Capability[]).some((capability) => capability.kind === 'image');

  const eyes = $derived(theirs.filter(watches));
  const hands = $derived(theirs.filter((device) => !watches(device)));

  /** Su quale luogo sta, se ce l'ha. È la domanda che viene subito. */
  const place = $derived(store.places.find((one) => (one.agentIds ?? []).includes(id))?.name);

  const health = $derived(devices.health([id]) ?? 'new');
  const says = $derived(
    health === 'live'
      ? 'Collegato'
      : health === 'degraded'
        ? 'Collegato, ma qualcosa non risponde'
        : health === 'lost'
          ? 'Non collegato'
          : 'Mai collegato',
  );
</script>

<PageShell
  title={agent?.name ?? 'Agente'}
  back={{ href: AGENTS_PATH, label: 'Torna agli agenti' }}
  siblings={false}
  layout="rows"
  lead={agent ? undefined : 'Questo agente non esiste più, o non è mai stato tuo.'}
>
  {#snippet tools()}
    {#if theirs.length > 3}<ViewControls vista={vistaDispositivi} label="In che ordine i dispositivi" />{/if}
  {/snippet}
  {#snippet meta()}
    {#if agent}
      <div class="stato">
        <span class="mark {health}" title={says} role="img" aria-label={says}></span>
        <span>{says}{place ? ` · ${place}` : ''}</span>
      </div>
    {/if}
  {/snippet}

  {#if agent}
    {#if eyes.length}
      <!-- le immagini prima di tutto: è quello per cui si apre questa pagina -->
      <div class="occhi" style={`--quante: ${Math.min(eyes.length, 2)}`}>
        {#each eyes as device (device.id)}
          <section class="occhio">
            <span class="nome">{device.name}</span>
            <DeviceFrame {device} />
          </section>
        {/each}
      </div>
    {/if}

    {#if hands.length}
      <div class="mani">
        {#each hands as device (device.id)}
          <DeviceControls {device} />
        {/each}
      </div>
    {:else if !eyes.length}
      <p class="vuoto">
        {agent.online
          ? 'Collegato, ma non ha ancora raccontato nessun dispositivo.'
          : 'Appena si collega, quello che trova compare qui.'}
      </p>
    {/if}
  {/if}
</PageShell>

<style>
  .stato {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ink-3);
  }

  .mark {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
  }

  .mark.degraded { background: var(--warn); }
  .mark.lost { background: var(--danger); }
  .mark.new { background: var(--ink-3); opacity: 0.5; }

  /* Le telecamere affiancate, due per riga finché c'è spazio: una casa ne ha
     quattro, e quattro francobolli in colonna sono quello che questa pagina
     doveva risolvere. Sotto i 700 pixel tornano una sotto l'altra, che su un
     telefono è l'unico modo di vederci qualcosa. */
  .occhi {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(var(--quante), minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }

  @media (max-width: 700px) {
    .occhi { grid-template-columns: 1fr; }
  }

  .occhio { display: grid; gap: 6px; min-width: 0; }

  .nome {
    font-size: 12.5px;
    font-weight: 560;
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  /* i comandi sotto, in righe come nella card di un agente */
  .mani {
    grid-column: 1 / -1;
    border-radius: var(--r-md);
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
    overflow: hidden;
  }

  .vuoto { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--ink-3); }
</style>
