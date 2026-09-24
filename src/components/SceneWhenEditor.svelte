<script lang="ts">
  import { chiediProva } from '../lib/chiedi';
  import { devices, type Scene, type SceneTrigger, type Timing } from '../lib/devices.svelte';
  import { fraseDiProva } from '../lib/prove';
  import { defaultWhen, GIORNI, today } from '../lib/timing';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import DateField from './DateField.svelte';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';
  import TimeField from './TimeField.svelte';

  /**
   * Il secondo passo di una scena: quando parte da sola.
   *
   * A un orario, o quando un dispositivo cambia, o tutte e due: ne basta una.
   * Stanno nello stesso passo perché sono la stessa domanda con due risposte
   * possibili, e separate si leggerebbero come due cose da fare entrambe.
   */
  let { scene }: { scene: Scene } = $props();

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

  const triggers = $derived(scene.triggers ?? []);
  /*
   * Tolto l'ultimo dispositivo, giorni e ore del «solo se» non varrebbero più
   * per niente, perché l'orario ha già i suoi. Se ne vanno con lui, invece di
   * restare scritti a dire una cosa che non succede.
   */
  const salvaTrigger = (lista: SceneTrigger[]) =>
    void devices.patchScene(
      scene,
      lista.length
        ? { triggers: lista }
        : { triggers: lista, only: (scene.only ?? []).filter((one) => one.kind !== 'days' && one.kind !== 'hours') },
    );

  function aggiungiTrigger(event: MouseEvent): void {
    chiediProva(
      event.currentTarget as HTMLElement,
      'quando',
      (prova) => salvaTrigger([...triggers, prova]),
      (deviceId, scelta) =>
        triggers.some((t) => t.deviceId === deviceId && t.op === 'is' && `${t.code}:=${t.value}` === scelta),
    );
  }
</script>

<Switch
  checked={!!scene.when && !scene.when.off}
  label="A un orario"
  note={scene.when
    ? scene.when.on
      ? 'Parte una volta sola, e poi l’orario se ne va.'
      : 'Se l’ora è quella, parte anche se non sei in casa.'
    : 'Oppure quando un dispositivo cambia, qui sotto.'}
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

<!-- le cose di casa che la fanno partire, sotto l'orario -->
{#each triggers as trigger, at (trigger.id ?? at)}
  <div class="riga">
    <Icon name="bell" />
    <span class="testo">{fraseDiProva(devices.list, trigger, 'quando')}</span>
    <Button look="icon" size="sm" title="Togli" onclick={() => salvaTrigger(triggers.filter((_one, index) => index !== at))}>
      <Icon name="close" />
    </Button>
  </div>
{/each}

{#if devices.list.length}
  <div class="aggiungi">
    <Chip label="Quando un dispositivo cambia" size="sm" look="off" extra="pick-btn" onclick={aggiungiTrigger} />
  </div>
{/if}

<style>
  .modo { display: flex; gap: 6px; }

  .orario { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

  .giorni { display: flex; flex-wrap: wrap; gap: 4px; }

  .riga {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 4px 0 4px 2px;
  }

  .riga > :global(.ico) { width: 14px; height: 14px; flex: none; color: var(--ink-3); }

  .testo { flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink-2); }

  .aggiungi { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
</style>
