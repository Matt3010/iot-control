<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { AGENTS_PATH } from '../lib/routing';
  import { ui } from '../lib/ui.svelte';
  import AddRow from './AddRow.svelte';
  import AgentControls from './AgentControls.svelte';
  import AgentPairing from './AgentPairing.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Gli agenti di un luogo, dall'inizio alla fine: li crei qui, qui copi il
   * comando da lanciare su quelle macchine, e qui dentro poi si accendono.
   *
   * Più d'uno quando le reti sono separate — la sala e la cucina, due edifici:
   * ogni rete vuole il suo servizio, ma l'indirizzo è lo stesso, quindi il pin
   * resta uno.
   */
  let {
    agentIds = [],
    placeKey,
    onchange,
  }: {
    agentIds?: string[];
    /** Serve a capire quali agenti sono già di questo luogo e quali liberi. */
    placeKey?: string;
    onchange: (ids: string[]) => void;
  } = $props();

  /** Quelli appesi a questo luogo, nell'ordine in cui li hai messi. */
  const mine = $derived(
    agentIds.map((id) => devices.agents.find((agent) => agent.id === id)).filter((agent) => !!agent),
  );

  /** Quelli che non stanno su nessun luogo: sono gli unici che si possono aggiungere. */
  const free = $derived(
    devices.agents.filter((agent) => {
      if (agentIds.includes(agent.id)) return false;
      const taken = store.places.find((place) => (place.agentIds ?? []).includes(agent.id));
      return !taken || taken.key === placeKey;
    }),
  );

  /**
   * Il comando si vede una volta sola, perché dentro c'è il token e del token
   * qui resta solo un'impronta. Vale per l'ultimo creato o rigenerato, vive in
   * questa schermata e se ne va con lei.
   */
  let fresh = $state<{ id: string; install: string } | null>(null);

  /** Il campo per crearne uno si apre chiedendolo, se ce n'è già qualcuno. */
  let creating = $state(false);
  let newName = $state('');
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const attach = (id: string) => onchange([...agentIds, id]);
  const detach = (id: string) => {
    if (fresh?.id === id) fresh = null;
    onchange(agentIds.filter((held) => held !== id));
  };

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.install);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1600);
    } catch {
      toast.show('Copia non riuscita: il comando è quello che vedi');
    }
  }

  async function create(name: string) {
    try {
      const made = await devices.createAgent(name);
      newName = '';
      creating = false;
      fresh = { id: made.agent.id, install: made.install };
      attach(made.agent.id);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function rotate(agent: Agent) {
    try {
      fresh = { id: agent.id, install: (await devices.newToken(agent)).install };
      toast.show("Token nuovo: l'agente va reinstallato con questo comando");
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  function remove(agent: Agent) {
    detach(agent.id);
    void devices.removeAgent(agent);
  }

  /** Cosa porta via eliminarlo: i suoi dispositivi. Il luogo resta un luogo. */
  function takesAway(agent: Agent): string {
    const count = devices.ofAgent(agent.id).length;
    if (!count) return 'Non ha ancora raccontato nessun dispositivo.';
    return `Se ne ${count === 1 ? 'va' : 'vanno'} ${count} dispositiv${count === 1 ? 'o' : 'i'}. Il luogo resta dov'è.`;
  }
</script>

<!--
  I tre comandi di un agente stanno tutti nella testata della sua card, come
  in tutte le altre righe dell'app: il cestino in fondo, e prima i due che
  non portano via niente. Ognuno chiede conferma, perché due su tre fanno
  smettere di funzionare qualcosa finché non rimedi.
-->
{#snippet controls(agent: Agent, attached: boolean)}
  <Button
    look="icon"
    title="Rigenera il token"
    onclick={(event: MouseEvent) =>
      ui.askSure(event.currentTarget as HTMLElement, {
        title: 'Rigenerare il token?',
        detail:
          'Quello di adesso smette di funzionare subito, e quella macchina resta scollegata finché non la reinstalli con il comando nuovo.',
        verb: 'Rigenera',
        tone: 'plain',
        no: 'Lascia stare',
        onYes: () => void rotate(agent),
      })}
  >
    <Icon name="refresh" />
  </Button>

  {#if attached}
    <Button
      look="icon"
      title="Stacca dal luogo"
      onclick={(event: MouseEvent) =>
        ui.askSure(event.currentTarget as HTMLElement, {
          title: 'Staccarlo da questo luogo?',
          detail:
            "L'agente resta e continua a funzionare: questo luogo smette solo di mostrarlo, e lo puoi rimettere qui o altrove.",
          verb: 'Stacca',
          tone: 'plain',
          no: 'Lascia stare',
          onYes: () => detach(agent.id),
        })}
    >
      <Icon name="logout" />
    </Button>
  {/if}

  <Button
    look="icon"
    tone="danger"
    extra="kill"
    title="Elimina agente"
    onclick={(event: MouseEvent) =>
      ui.askSure(event.currentTarget as HTMLElement, {
        title: `Eliminare “${agent.name}”?`,
        detail: takesAway(agent),
        verb: 'Elimina',
        onYes: () => remove(agent),
      })}
  >
    <Icon name="trash" />
  </Button>
{/snippet}

{#snippet command()}
  <div class="install">
    <span class="eyebrow">Da lanciare su quella macchina</span>
    <div class="cmd">
      <code>{fresh?.install}</code>
      <Button look="icon" title="Copia il comando" onclick={copy}>
        <Icon name={copied ? 'check' : 'link'} />
      </Button>
    </div>
    <p class="once">
      Si vede una volta sola: dentro c'è il token, e qui ne resta solo un'impronta.
      Vuole <b>Linux</b>: su Windows incollala dentro WSL, su Mac dentro una macchina virtuale.
      Fuori di lì Docker non sta sulla rete di casa, e l'agente i dispositivi non li vedrebbe.
    </p>
  </div>
{/snippet}

<div class="field">
  <!-- il titolo del campo e la via d'uscita verso la pagina intera: la
       seconda non è una nota in fondo, è dove si va quando qui è stretto -->
  <span class="head">
    <span class="eyebrow">{mine.length > 1 ? 'Agenti' : 'Agente'}</span>
    <a class="all" href={AGENTS_PATH}>Gestisci tutti gli agenti</a>
  </span>

  <!-- quelli che stanno qui: uno sotto l'altro, ognuno con i suoi comandi -->
  {#each mine as agent (agent.id)}
    <AgentControls {agent}>
      {#snippet trail()}{@render controls(agent, true)}{/snippet}

      {#snippet foot()}
        {#if fresh?.id === agent.id}{@render command()}{/if}

        <!-- collegare l'account sta qui e non in Home Assistant: è la cosa
             che manca a un agente appena installato, e chiederla altrove
             vorrebbe dire mandare via chi sta guardando -->
        <AgentPairing {agent} />
      {/snippet}
    </AgentControls>
  {/each}

  <!-- uno solo e libero: si mostra com'è fatto, invece di una pillola da
       cliccare per scoprirlo. Il clic serve a metterlo qui, non a guardarlo. -->
  {#if !mine.length && free.length === 1 && free[0]}
    {@const only = free[0]}
    <AgentControls agent={only}>
      {#snippet trail()}{@render controls(only, false)}{/snippet}
      {#snippet foot()}
        <!-- collegare un account è cosa dell'agente, non del luogo: si può
             fare anche prima di deciderne la casa -->
        <AgentPairing agent={only} />
        <div class="acts">
          <Button look="ghost" onclick={() => attach(only.id)}>Metti su questo luogo</Button>
        </div>
      {/snippet}
    </AgentControls>
  {:else if free.length}
    <p class="sub">
      {mine.length ? 'Liberi, da aggiungere qui:' : 'Ne hai che non stanno su nessun luogo:'}
    </p>
    <!-- non sono <Chip>: una chip è già un bottone, e un bottone dentro un
         bottone non esiste. Stessa forma, due comandi distinti. -->
    <div class="chips">
      {#each free as agent (agent.id)}
        <span class="pill">
          <button
            type="button"
            class="pick"
            title={agent.online ? "L'agente sta qui" : 'Adesso non è collegato'}
            onclick={() => attach(agent.id)}
          >
            {agent.name}
          </button>
          <button
            type="button"
            class="drop kill"
            title="Elimina agente"
            aria-label={`Elimina ${agent.name}`}
            onclick={(event: MouseEvent) =>
              ui.askSure(event.currentTarget as HTMLElement, {
                title: `Eliminare “${agent.name}”?`,
                detail: takesAway(agent),
                verb: 'Elimina',
                onYes: () => void devices.removeAgent(agent),
              })}
          >
            <Icon name="close" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <!-- crearne uno: è l'unica cosa in schermo quando non c'è niente, ed è un
       link quando c'è già qualcosa da guardare -->
  {#if creating || (!mine.length && !free.length)}
    <AddRow
      placeholder="Nome agente — es. Padova"
      title="Crea agente"
      bind:value={newName}
      onadd={create}
    />
  {:else}
    <div class="acts">
      <Button look="link" onclick={() => (creating = true)}>
        {mine.length ? 'Aggiungi un altro agente' : 'Creane uno nuovo'}
      </Button>
    </div>
  {/if}

  {#if !mine.length}
    <p class="hint">
      Un agente è il servizio che installi su una macchina in quel posto: trova i dispositivi
      sulla rete e si collega qui da solo. Appena creato si attacca a questo luogo, e ti diamo il
      comando da lanciare là sopra. Ne servono due quando le reti sono separate.
    </p>
  {/if}
</div>

<style>
  .field { display: grid; gap: 8px; min-width: 0; }

  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  /* la riga che dice cosa sono le pillole qui sotto: senza, un elenco di nomi
     sotto l'etichetta "AGENTE" si legge come "gli agenti di questo luogo" */
  .sub { margin: 0; font-size: 11px; line-height: 1.4; color: var(--ink-3); }

  /* la forma è quella di una chip spenta: chi guarda non deve accorgersi che
     qui dentro i bottoni sono due */
  .pill {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding-right: 4px;
    border: 1px solid var(--hairline);
    border-radius: 99px;
    opacity: 0.55;
    transition: opacity 0.16s, border-color 0.16s, transform 0.14s var(--ease);
  }

  .pill:hover, .pill:focus-within { opacity: 1; transform: translateY(-1px); }

  .pick {
    padding: 0 6px 0 11px;
    border: 0;
    background: none;
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .pill:hover .pick { color: var(--ink); }

  /* la ✕ sta sempre, smorta: nascosta lasciava un buco nella pillola, e
     soprattutto un comando che si scopre solo passandoci sopra non si scopre.
     È il cestino delle righe di categorie e gruppi, in piccolo. */
  .drop {
    display: grid;
    place-items: center;
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

  .pill:hover .drop, .drop:hover, .drop:focus-visible { opacity: 1; }

  .drop:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }

  .drop :global(.ico) { width: 12px; height: 12px; }

  /* col dito non c'è il passaggio del mouse: lì la pillola è sempre leggibile */
  @media (hover: none) {
    .pill { opacity: 1; }
  }

  .hint { margin: 2px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

  /* installare, collegare un account, rigenerare un token: cose che si fanno
     una volta e vogliono spazio. Non in una colonna da trecento pixel. */
  .all {
    flex: none;
    font-size: 11px;
    color: var(--ink-3);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--hairline);
    transition: color 0.16s;
  }

  .all:hover { color: var(--ink-2); }


  /* il comando da incollare: si legge come un terminale perché è un terminale.
     I `min-width` non sono decorativi: dentro una griglia una cella non scende
     sotto la larghezza del suo contenuto, e una riga di `curl` senza a capo è
     larga quanto vuole — è così che sfondava il bordo della scheda. */
  .install { display: grid; gap: 6px; min-width: 0; }

  .cmd {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    padding: 4px 4px 4px 9px;
    border-radius: var(--r-sm);
    background: var(--sunken-hover);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
  }

  .cmd code {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .once { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }

  .once b { font-weight: 600; color: var(--ink-2); }

  /* i comandi piccoli in fondo a una card: su una riga, senza urtarsi */
  .acts {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11.5px;
  }

</style>
