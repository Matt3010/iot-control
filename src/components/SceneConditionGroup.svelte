<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { chiediProva } from '../lib/chiedi';
  import { devices, type SceneCondition, type SceneConditionGroup } from '../lib/devices.svelte';
  import { dopoGiorni, oraIn } from '../lib/fuso';
  import { fraseCondizione } from '../lib/prove';
  import { GIORNI } from '../lib/timing';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import DateField from './DateField.svelte';
  import Icon from './Icon.svelte';
  import Self from './SceneConditionGroup.svelte';
  import TimeField from './TimeField.svelte';

  /**
   * Un gruppo di condizioni, con dentro altre condizioni o altri gruppi.
   *
   * Tutte in fila ne chiedevano sempre tutte, e «la prima e la seconda,
   * oppure la terza» non si poteva dire. Ogni gruppo dice da sé se devono
   * valere tutte o ne basta una, e un gruppo dentro un altro è una parentesi
   * senza parentesi. Fra una riga e l'altra c'è scritto «e» oppure «o»,
   * perché la regola in cima si dimentica a metà elenco.
   *
   * Non salva niente: dice a chi lo contiene com'è diventato, e chi sta più
   * fuori di tutti salva la scena.
   */
  let {
    gruppo,
    livello = 0,
    daDispositivo,
    onchange,
    onremove,
  }: {
    gruppo: SceneConditionGroup;
    /** Quanto è dentro: il primo è 0, e oltre il 2 non si apre un gruppo nuovo. */
    livello?: number;
    /** Se la scena parte anche da un dispositivo: giorni e ore valgono solo lì. */
    daDispositivo: boolean;
    onchange: (dopo: SceneConditionGroup) => void;
    /** Solo per un gruppo dentro un altro, che si può togliere intero. */
    onremove?: () => void;
  } = $props();

  const items = $derived(gruppo.items);
  const salva = (lista: SceneCondition[]) => onchange({ ...gruppo, items: lista });
  const cambia = (at: number, dopo: SceneCondition) => salva(items.map((one, index) => (index === at ? dopo : one)));
  const togli = (at: number) => salva(items.filter((_one, index) => index !== at));

  function aggiungiDispositivo(event: MouseEvent): void {
    chiediProva(event.currentTarget as HTMLElement, 'se', (prova) => salva([...items, { kind: 'device', ...prova }]));
  }

  /* le condizioni sul tempo nascono con un valore che si vede e si cambia lì */
  const oggi = () => oraIn(auth.tz).date;
  const aggiungiGiorni = () => salva([...items, { kind: 'days', days: [1, 2, 3, 4, 5] }]);
  const aggiungiOre = () => salva([...items, { kind: 'hours', from: '08:00', to: '20:00' }]);
  const aggiungiDate = () => salva([...items, { kind: 'dates', from: oggi(), to: dopoGiorni(oggi(), 7) }]);
  // un gruppo dentro uno uguale non cambia niente: nasce con la regola opposta
  const aggiungiGruppo = () =>
    salva([...items, { kind: 'group', match: gruppo.match === 'all' ? 'any' : 'all', items: [] }]);

  function giraGiorno(at: number, giorni: number[], day: number): void {
    const dopo = giorni.includes(day) ? giorni.filter((one) => one !== day) : [...giorni, day].sort();
    // un giorno ci vuole: una condizione che non vale mai è una scena spenta
    if (dopo.length) cambia(at, { kind: 'days', days: dopo });
  }

  /*
   * Giorni e ore senza un dispositivo che la fa partire non valgono, e non
   * si mostrano come se valessero. Una per genere in ogni gruppo: due fasce
   * orarie in un «tutte» valgono solo dove si sovrappongono, e nessuno lo
   * intende scrivendole.
   */
  const mostra = (one: SceneCondition) => daDispositivo || (one.kind !== 'days' && one.kind !== 'hours');
  const visibili = $derived(items.map((one, at) => ({ one, at })).filter(({ one }) => mostra(one)));
  const ha = (kind: SceneCondition['kind']) => items.some((one) => one.kind === kind);
  const legame = $derived(gruppo.match === 'any' ? 'o' : 'e');
</script>

<div class="gruppo" class:is-dentro={livello > 0}>
  {#if livello > 0 || visibili.length > 1}
    <div class="regola">
      <span class="chiede">Devono valere</span>
      <Chip label="tutte" size="sm" look={gruppo.match === 'all' ? 'sel' : 'off'} onclick={() => onchange({ ...gruppo, match: 'all' })} />
      <Chip label="almeno una" size="sm" look={gruppo.match === 'any' ? 'sel' : 'off'} onclick={() => onchange({ ...gruppo, match: 'any' })} />
      {#if onremove}
        <span class="spinta"></span>
        <Button look="icon" size="sm" title="Togli il gruppo" onclick={onremove}><Icon name="close" /></Button>
      {/if}
    </div>
  {/if}

  {#each visibili as { one: condizione, at }, posto (condizione.id ?? at)}
    {#if posto > 0}<span class="legame">{legame}</span>{/if}
    {#if condizione.kind === 'group'}
      <Self
        gruppo={condizione}
        livello={livello + 1}
        {daDispositivo}
        onchange={(dopo: SceneConditionGroup) => cambia(at, dopo)}
        onremove={() => togli(at)}
      />
    {:else}
      <div class="riga">
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
        <Button look="icon" size="sm" title="Togli" onclick={() => togli(at)}>
          <Icon name="close" />
        </Button>
      </div>
    {/if}
  {/each}

  <div class="aggiungi">
    {#if devices.list.length}
      <Chip label="Un dispositivo" size="sm" look="off" extra="pick-btn" onclick={aggiungiDispositivo} />
    {/if}
    {#if daDispositivo && !ha('days')}<Chip label="Certi giorni" size="sm" look="off" onclick={aggiungiGiorni} />{/if}
    {#if daDispositivo && !ha('hours')}<Chip label="Una fascia oraria" size="sm" look="off" onclick={aggiungiOre} />{/if}
    {#if !ha('dates')}<Chip label="Un periodo" size="sm" look="off" onclick={aggiungiDate} />{/if}
    {#if livello < 2}<Chip label="Un gruppo" size="sm" look="off" onclick={aggiungiGruppo} />{/if}
  </div>
</div>

<style>
  .gruppo { display: grid; gap: 6px; min-width: 0; }

  /* un gruppo dentro un altro: una riga a sinistra che lo tiene insieme,
     come una parentesi scritta in verticale */
  .gruppo.is-dentro {
    padding: 4px 0 4px 10px;
    border-left: 2px solid var(--hairline);
  }

  .regola { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }

  .chiede { font-size: 11.5px; color: var(--ink-3); }

  .spinta { flex: 1; }

  /* «e» oppure «o» fra una riga e l'altra, piccolo e in disparte */
  .legame {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding-left: 2px;
  }

  .riga {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 2px 0 2px 2px;
  }

  .testo { flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink-2); }

  .testo.is-campi { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }

  .giorni { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; }

  .aggiungi { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
</style>
