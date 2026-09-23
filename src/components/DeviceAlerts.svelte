<script lang="ts">
  import { devices, type Device } from '../lib/devices.svelte';
  import type { Capability } from '../lib/types';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';

  /**
   * Quello che una cosa ti dice: se tace, e quando diventa qualcosa.
   *
   * Sta in un pezzo suo perché non appartiene alla riga di un dispositivo.
   * Nella scheda dell'agente si va per accendere e per aprire, e ogni riga
   * portava dietro una campana e una sezione che quasi sempre restava chiusa:
   * venti cose attaccate facevano venti campane per una decisione che si
   * prende una volta sola. Qui invece è il motivo per cui si è aperta la
   * pagina, e quelle sorvegliate si leggono una sotto l'altra.
   */
  let { device }: { device: Device } = $props();

  const rules = $derived(devices.rulesOf(device.id));

  /**
   * Come si legge una regola su questa cosa.
   *
   * Il nome del dispositivo non ci sta dentro: la frase si legge sotto al suo
   * nome, e ripeterlo vuol dire «Tenda soggiorno» due volte in due righe alte
   * trenta pixel. Le parole sono quelle che dice il dispositivo, e il valore
   * sta fra virgolette perché «diventa apri» non è italiano e non lo diventa
   * smontando la parola: quei valori li sceglie lui, e sono stati dove una
   * porta dice aperta e comandi dove una tenda dice apri.
   */
  function frase(capability: Capability, value: string): string {
    if (capability.kind === 'switch')
      return value === 'true' ? `${capability.label} si accende` : `${capability.label} si spegne`;
    return `${capability.label} diventa «${value}»`;
  }

  /** La stessa frase partendo da una regola già scritta. */
  function frasePer(code: string, becomes: string): string | undefined {
    const capability = (device.capabilities as Capability[]).find((one) => one.code === code);
    return capability ? frase(capability, becomes) : undefined;
  }

  /**
   * I valori su cui si può scrivere una regola.
   *
   * Solo quelli che un dispositivo assume davvero: un interruttore ha acceso
   * e spento, una tenda ha le sue tre posizioni. Su un numero — la
   * luminosità, i gradi — non si offre niente per ora: «sopra» e «sotto» sono
   * un'altra cosa da quella che c'è qui, e mezza cosa non si mette.
   */
  const watchable = $derived(
    (device.capabilities as Capability[]).flatMap((capability) => {
      if (capability.kind === 'switch')
        return ['true', 'false'].map((value) => ({
          id: `${capability.code}:${value}`,
          label: frase(capability, value),
        }));
      if (capability.kind === 'enum')
        return capability.values.map((value) => ({
          id: `${capability.code}:${value}`,
          label: frase(capability, String(value)),
        }));
      return [];
    }),
  );

  /** Quelle che non sono già scritte: proporre due volte la stessa è rumore. */
  const offrite = $derived(
    watchable.filter((one) => !rules.some((rule) => `${rule.code}:${rule.becomes}` === one.id)),
  );

  function addRule(scelto: string): void {
    const [code, becomes] = scelto.split(/:(.*)/s);
    void devices.addRule(device.id, code as string, becomes as string);
  }
</script>

<div class="avvisi">
  <Switch
    checked={!!device.watch}
    label="Se smette di rispondere"
    note={device.watch
      ? 'Ricevi un avviso dopo un silenzio prolungato.'
      : 'Non ricevi avvisi sul suo silenzio.'}
    onchange={(wanted: boolean) => void devices.watch(device, wanted)}
  />

  {#if rules.length}
    <ul class="regole">
      {#each rules as rule (rule.id)}
        <li class="regola" class:is-off={rule.off}>
          <span class="dice">{frasePer(rule.code, rule.becomes) ?? rule.says}</span>
          <Button
            look="icon"
            size="sm"
            extra="regola-btn"
            title={rule.off ? 'Riaccendi questa regola' : 'Sospendi questa regola'}
            onclick={() => void devices.flipRule(rule, !rule.off)}
          >
            <Icon name={rule.off ? 'alertOff' : 'bell'} />
          </Button>
          <Button
            look="icon"
            size="sm"
            tone="danger"
            extra="regola-btn kill"
            title="Togli questa regola"
            onclick={() => void devices.removeRule(rule)}
          >
            <Icon name="trash" />
          </Button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if offrite.length}
    <!-- Le scelte scritte qui e non dentro a una domanda che si apre: sono
         due o tre, stanno in una riga, e su un telefono un elenco che compare
         da qualche altra parte dello schermo è un salto in più per aggiungere
         una riga sola. -->
    <div class="aggiungi">
      <span class="eyebrow">Avvisami quando…</span>
      <div class="scelte">
        {#each offrite as scelta (scelta.id)}
          <Chip label={scelta.label} size="sm" onclick={() => addRule(scelta.id)} />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .avvisi { display: grid; gap: 9px; }

  .regole { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }

  .regola {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  .regola.is-off .dice { opacity: 0.5; text-decoration: line-through; }

  .dice {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    /* una regola accesa è una cosa che vale: si legge come la levetta sopra,
       non come la nota di servizio sotto */
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* i comandi di una riga si accendono quando ci passi sopra: da fermi
     sarebbero due icone per ogni regola, e le regole sono tante */
  .avvisi :global(.regola-btn) { width: 24px; height: 24px; opacity: 0.4; transition: opacity 0.16s; }

  .regola:hover :global(.regola-btn), .avvisi :global(.regola-btn:hover) { opacity: 1; }

  .aggiungi { display: grid; gap: 6px; }

  .scelte { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
