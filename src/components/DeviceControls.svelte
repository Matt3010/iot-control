<script lang="ts">
  import { thingHealth } from '../lib/health';
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
  const how = $derived(thingHealth(devices.agentUp(device.agentId), device.online));
  const says = $derived(
    how === 'live'
      ? 'Raggiungibile'
      : how === 'lost'
        ? 'Non risponde'
        : 'Non si sa, perché l’agente non è collegato',
  );

  /* ---------------------------------------------------------- le regole */

  /** Le regole scritte su questo dispositivo, e le cose che potrebbe fare. */
  const rules = $derived(devices.rulesOf(device.id));

  /**
   * Gli avvisi di questa cosa, aperti o chiusi.
   *
   * Stanno dietro la campana e non sotto al nome: sono una cosa che si
   * sistema una volta e poi non si guarda piu', e tenerli sempre aperti
   * vorrebbe dire due righe in piu' per ognuno dei venti dispositivi di una
   * casa. La campana intanto dice, da chiusa, se qualcuno sta guardando.
   */
  let avvisi = $state(false);
  const guardato = $derived(!!device.watch || rules.some((rule) => !rule.off));

  /**
   * Come si legge una regola su questa cosa.
   *
   * Il nome del dispositivo non ci sta dentro: la frase si legge sotto al suo
   * nome, e ripeterlo vuol dire «Tenda soggiorno» due volte in due righe
   * alte trenta pixel. Le parole sono quelle che dice il dispositivo, e il
   * valore sta fra virgolette perché «diventa apri» non è italiano e non lo
   * diventa smontando la parola: quei valori li sceglie lui, e sono stati
   * dove una porta dice aperta e comandi dove una tenda dice apri.
   */
  function frase(capability: Capability, value: string): string {
    if (capability.kind === 'switch') return value === 'true' ? `${capability.label} si accende` : `${capability.label} si spegne`;
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
   * luminosità, i gradi — non si offre niente per ora: «sopra» e «sotto»
   * sono un'altra cosa da quella che c'è qui, e mezza cosa non si mette.
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
      `${wanted ? 'Accendere' : 'Spegnere'} «${device.name}»?`,
      wanted ? 'Accendi' : 'Spegni',
      () => void devices.command(device, capability.code, wanted),
    );
  }
</script>

<div class="dev" class:is-lit={lit} class:is-off={!device.online}>
  <div class="dev-head">
    <!-- il pallino dice se la cosa risponde, non se è accesa: quello lo
         dicono la riga che si scalda e il suo interruttore -->
    <span class="dev-dot is-{how}" role="img" aria-label={says} title={says}></span>
    <span class="dev-name">{device.name}</span>
    <!-- l'avviso solo per un guasto vero: se è l'agente a mancare, quello lo
         dice già il suo pallino qui sopra, e ripeterlo su ogni riga sarebbe
         una colonna di allarmi per una cosa sola -->
    {#if how === 'lost'}
      <span class="dev-away" title={says}><Icon name="alert" /></span>
    {/if}

    <!-- «Avvisami se questo smette di rispondere».
         Sta qui e non in un elenco di regole altrove, perche' si decide
         guardando la cosa di cui si parla. Spento di sua natura: una casa ha
         venti cose attaccate e quasi tutte possono tacere un pomeriggio
         senza che importi a nessuno. -->
    <Button
      look="icon"
      size="sm"
      extra="dev-watch"
      title={guardato ? 'Gli avvisi di questa cosa sono accesi' : 'Avvisami quando…'}
      aria-expanded={avvisi}
      aria-pressed={guardato}
      onclick={() => (avvisi = !avvisi)}
    >
      <Icon name={guardato ? 'bell' : 'alertOff'} />
    </Button>
  </div>

  <div class="dev-body">
    {#each device.capabilities as capability (capability.code)}
      {#if capability.kind === 'switch'}
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
                label={value}
                look={device.state[capability.code] === value ? 'sel' : 'off'}
                size="sm"
                disabled={!device.online || devices.isBusy(device.id, capability.code)}
                onclick={(event: MouseEvent) =>
                  confirm(
                    event.currentTarget as HTMLElement,
                    `${value} «${device.name}»?`,
                    value,
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
    {/each}
  </div>

  {#if avvisi}
    <!-- Gli avvisi di questa cosa, tutti nello stesso posto: se tace, e
         quando diventa qualcosa. Si decide guardando la cosa di cui si
         parla, non un elenco di regole dall'altra parte dell'app. -->
    <div class="dev-alerts">
      <!-- La riga sotto dice cosa cambia, come su ogni altra levetta
           dell'app. Non dice dopo quanto: l'attesa prima di chiamarlo
           silenzio la decide il server, e un numero scritto qui sarebbe vero
           solo finché nessuno lo cambia di là. -->
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
        <!-- Le scelte scritte qui e non dentro a una domanda che si apre:
             sono due o tre, stanno in una riga, e su un telefono un elenco
             che compare da qualche altra parte dello schermo e' un salto in
             piu' per aggiungere una riga sola. -->
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

  .dev-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
    transition: background 0.22s, box-shadow 0.22s;
  }

  /* non risponde: rosso, e accanto al nome ci finisce anche un'icona —
     il colore da solo non basta a chi non lo distingue */
  .dev-dot.is-lost { background: var(--danger); }

  /* non si sa: l'agente non è collegato, e di qui non si vede niente */
  .dev-dot.is-unknown {
    background: var(--ink-3);
    opacity: 0.55;
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

  /* l'interruttore dell'avviso: smorto finche' e' spento, acceso quando
     qualcuno sta guardando per te */
  .dev-head :global(.dev-watch) { margin-left: auto; opacity: 0.35; transition: opacity 0.16s; }

  .dev-head:hover :global(.dev-watch), .dev-head :global(.dev-watch:hover) { opacity: 1; }

  .dev-head :global(.dev-watch[aria-expanded='true']) { opacity: 1; }

  .dev-head :global(.dev-watch[aria-pressed='true']) { opacity: 1; color: var(--accent); }

  /* La sezione degli avvisi, che si apre dalla campana.
     Sta sotto ai comandi e divisa da una riga: sopra c'e' quello che fai
     alla cosa, sotto quello che la cosa dice a te. Non e' una scatola dentro
     la scatola — resta nella stessa colonna del nome e dei comandi: un
     riquadro qui dentro voleva il suo margine piu' il suo bordo, e il testo
     finiva due rientri piu' in la' di tutto il resto della riga. */
  .dev-alerts {
    display: grid;
    gap: 9px;
    margin-top: 2px;
    padding-top: 10px;
    border-top: 1px solid var(--hairline);
  }

  .regole { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }

  .aggiungi { display: grid; gap: 6px; }

  .scelte { display: flex; flex-wrap: wrap; gap: 6px; }

  .regola {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .regola.is-off .dice { opacity: 0.5; text-decoration: line-through; }

  .dice {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    /* una regola accesa e' una cosa che vale: si legge come la levetta
       sopra, non come la nota di servizio sotto */
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dev-alerts :global(.regola-btn) { width: 24px; height: 24px; opacity: 0.4; transition: opacity 0.16s; }

  .regola:hover :global(.regola-btn), .dev-alerts :global(.regola-btn:hover) { opacity: 1; }

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
