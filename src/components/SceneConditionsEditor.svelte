<script lang="ts">
  import { chiediProva } from '../lib/chiedi';
  import { devices, type Scene, type SceneCondition } from '../lib/devices.svelte';
  import { fraseCondizione } from '../lib/prove';
  import { dopoGiorni, oraIn } from '../lib/fuso';
  import { auth } from '../lib/auth.svelte';
  import { GIORNI } from '../lib/timing';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import DateField from './DateField.svelte';
  import Icon from './Icon.svelte';
  import TimeField from './TimeField.svelte';

  /**
   * Il terzo passo di una scena: a quali condizioni parte da sola.
   *
   * Devono valere tutte, nel momento in cui qualcosa la farebbe partire.
   * Valgono solo per le partenze automatiche: premuta a mano, una scena
   * parte sempre, perché chi la preme la vuole adesso.
   */
  let { scene }: { scene: Scene } = $props();

  const triggers = $derived(scene.triggers ?? []);
  const only = $derived(scene.only ?? []);
  /** Se parte da sola in qualche modo: senza, le condizioni non hanno a cosa servire. */
  const automatica = $derived(!!(scene.when && !scene.when.off) || triggers.length > 0);

  const salvaCondizioni = (lista: SceneCondition[]) => void devices.patchScene(scene, { only: lista });

  function aggiungiDispositivo(event: MouseEvent): void {
    chiediProva(event.currentTarget as HTMLElement, 'se', (prova) =>
      salvaCondizioni([...only, { kind: 'device', ...prova }]),
    );
  }

  /* le condizioni sul tempo nascono con un valore che si vede e si cambia lì */
  const oggi = () => oraIn(auth.tz).date;
  const aggiungiGiorni = () => salvaCondizioni([...only, { kind: 'days', days: [1, 2, 3, 4, 5] }]);
  const aggiungiOre = () => salvaCondizioni([...only, { kind: 'hours', from: '08:00', to: '20:00' }]);
  const aggiungiDate = () => salvaCondizioni([...only, { kind: 'dates', from: oggi(), to: dopoGiorni(oggi(), 7) }]);

  const cambia = (at: number, dopo: SceneCondition) =>
    salvaCondizioni(only.map((one, index) => (index === at ? dopo : one)));

  function giraGiorno(at: number, giorni: number[], day: number): void {
    const dopo = giorni.includes(day) ? giorni.filter((one) => one !== day) : [...giorni, day].sort();
    // un giorno ci vuole: una condizione che non vale mai è una scena spenta
    if (dopo.length) cambia(at, { kind: 'days', days: dopo });
  }

  /*
   * Giorni e ore valgono solo per le partenze da un dispositivo: l'orario ha
   * già i suoi giorni e il suo minuto, e offrirli anche qui era chiedere due
   * volte la stessa cosa, con il rischio di una fascia che non lo contiene.
   */
  const daDispositivo = $derived(triggers.length > 0);
  const haGiorni = $derived(only.some((one) => one.kind === 'days'));
  const haOre = $derived(only.some((one) => one.kind === 'hours'));
  const haDate = $derived(only.some((one) => one.kind === 'dates'));
</script>

{#if automatica}
  <div class="parte">
    <span class="nota">
      Valgono quando parte da sola. Premuta a mano parte sempre.{#if daDispositivo && scene.when && !scene.when.off}
        Giorni e ore valgono per i dispositivi, perché l’orario ha già i suoi.{/if}
    </span>
  </div>

  {#each only as condizione, at (condizione.id ?? at)}
    <!-- giorni e ore senza un dispositivo che la fa partire non valgono, e
         non si mostrano come se valessero -->
    {#if daDispositivo || (condizione.kind !== 'days' && condizione.kind !== 'hours')}
    <div class="riga is-condizione">
      {#if condizione.kind === 'days'}
        <div class="giorni">
          {#each GIORNI as label, day (day)}
            <Chip {label} size="sm" look={condizione.days.includes(day) ? 'on' : 'off'} onclick={() => giraGiorno(at, condizione.days, day)} />
          {/each}
        </div>
      {:else if condizione.kind === 'hours'}
        <span class="testo is-campi">
          fra le
          <TimeField value={condizione.from} label="Dalle" onchange={(from: string) => cambia(at, { ...condizione, from })} />
          e le
          <TimeField value={condizione.to} label="Alle" onchange={(to: string) => cambia(at, { ...condizione, to })} />
        </span>
      {:else if condizione.kind === 'dates'}
        <span class="testo is-campi">
          dal
          <DateField value={condizione.from} label="Dal giorno" onchange={(from: string) => cambia(at, { ...condizione, from })} />
          al
          <DateField value={condizione.to} label="Al giorno" onchange={(to: string) => cambia(at, { ...condizione, to })} />
        </span>
      {:else}
        <span class="testo">{fraseCondizione(devices.list, condizione)}</span>
      {/if}
      <Button look="icon" size="sm" title="Togli" onclick={() => salvaCondizioni(only.filter((_one, index) => index !== at))}>
        <Icon name="close" />
      </Button>
    </div>
    {/if}
  {/each}

  <!-- una condizione per genere sul tempo: due fasce orarie insieme valgono
       solo dove si sovrappongono, e nessuno lo intende scrivendole -->
  <div class="aggiungi">
    {#if devices.list.length}
      <Chip label="Un dispositivo" size="sm" look="off" extra="pick-btn" onclick={aggiungiDispositivo} />
    {/if}
    {#if daDispositivo && !haGiorni}<Chip label="Certi giorni" size="sm" look="off" onclick={aggiungiGiorni} />{/if}
    {#if daDispositivo && !haOre}<Chip label="Una fascia oraria" size="sm" look="off" onclick={aggiungiOre} />{/if}
    {#if !haDate}<Chip label="Un periodo" size="sm" look="off" onclick={aggiungiDate} />{/if}
  </div>
{:else}
  <p class="nota">
    Non parte da sola, quindi non ci sono condizioni da mettere. Prima si sceglie quando parte, al passo prima.
  </p>
{/if}

<style>
  .riga {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 4px 0 4px 2px;
  }

  .riga > :global(.ico) { width: 14px; height: 14px; flex: none; color: var(--ink-3); }

  .testo { flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink-2); }

  .testo.is-campi { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }

  .giorni { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; }

  .aggiungi { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }

  .parte { display: grid; gap: 2px; }

  .nota { font-size: 11px; color: var(--ink-3); }
</style>
