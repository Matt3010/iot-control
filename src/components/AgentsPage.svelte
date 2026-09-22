<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import AddRow from './AddRow.svelte';
  import AgentControls from './AgentControls.svelte';
  import AgentPairing from './AgentPairing.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * La pagina degli agenti.
   *
   * Nella scheda di un luogo e nel popup sulla mappa ci sta quello che si usa
   * tutti i giorni: accendere, spegnere, aprire. Installare un servizio,
   * collegare un account, rigenerare un token sono cose che fai una volta e
   * vogliono spazio — in una colonna da trecento pixel diventano un elenco
   * che scorre, e non si capisce più dove si è.
   */
  let newName = $state('');
  let fresh = $state<{ id: string; install: string } | null>(null);
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Su quale luogo sta un agente, se ce l'ha: è la domanda che viene subito. */
  const placeOf = (agent: Agent) => store.places.find((place) => (place.agentIds ?? []).includes(agent.id));

  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
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
      fresh = { id: made.agent.id, install: made.install };
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

  /** Cosa porta via eliminarlo: i suoi dispositivi. Il luogo resta un luogo. */
  function takesAway(agent: Agent): string {
    const count = devices.ofAgent(agent.id).length;
    const where = placeOf(agent);
    const devs = count
      ? `Se ne ${count === 1 ? 'va' : 'vanno'} ${count} dispositiv${count === 1 ? 'o' : 'i'}.`
      : 'Non ha ancora raccontato nessun dispositivo.';
    return where ? `${devs} «${where.name}» resta dov'è.` : devs;
  }
</script>

<div class="page">
  <header>
    <a class="back" href="/">
      <Icon name="collapse" />
      Torna alla mappa
    </a>
    <h1>Agenti</h1>
    <p class="lead">
      Un agente è il servizio che installi su una macchina accesa in un posto: trova i dispositivi
      sulla rete di casa e si collega qui da solo. Ne servono due quando le reti sono separate.
    </p>
  </header>

  <div class="grid">
    {#each devices.agents as agent (agent.id)}
      {@const where = placeOf(agent)}
      <section class="card">
        <AgentControls {agent}>
          {#snippet trail()}
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
                  onYes: () => void devices.removeAgent(agent),
                })}
            >
              <Icon name="trash" />
            </Button>
          {/snippet}

          {#snippet foot()}
            <p class="where">
              {#if where}
                Sta su <b>{where.name}</b>
              {:else}
                Non è ancora su nessun luogo: lo metti dalla scheda di un luogo.
              {/if}
            </p>

            {#if fresh?.id === agent.id}
              <div class="install">
                <span class="eyebrow">Da lanciare su quella macchina</span>
                <div class="cmd">
                  <code>{fresh.install}</code>
                  <Button look="icon" title="Copia il comando" onclick={() => copy(fresh!.install)}>
                    <Icon name={copied ? 'check' : 'link'} />
                  </Button>
                </div>
                <p class="once">
                  Si vede una volta sola: dentro c'è il token, e qui ne resta solo un'impronta.
                  Vuole <b>Linux</b> — su Windows incollala dentro WSL.
                </p>
              </div>
            {/if}

            <AgentPairing {agent} />
          {/snippet}
        </AgentControls>
      </section>
    {/each}

    <section class="card is-new">
      <span class="eyebrow">Un altro agente</span>
      <AddRow
        placeholder="Nome agente — es. Padova"
        title="Crea agente"
        bind:value={newName}
        onadd={create}
      />
      <p class="once">
        Appena creato ti diamo il comando da lanciare su quella macchina. Poi lo metti su un luogo
        dalla sua scheda.
      </p>
    </section>
  </div>
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    overflow: auto;
    padding: 28px 20px 48px;
    background: rgb(var(--base));
  }

  header {
    max-width: 960px;
    margin: 0 auto 22px;
    display: grid;
    gap: 6px;
  }

  .back {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12.5px;
    color: var(--ink-3);
    text-decoration: none;
    transition: color 0.16s;
  }

  .back:hover { color: var(--ink); }

  /* la freccia guarda a sinistra: è un ritorno, non un pannello che si chiude */
  .back :global(.ico) { width: 14px; height: 14px; transform: rotate(-90deg); }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 620;
    letter-spacing: -0.022em;
    color: var(--ink);
  }

  .lead {
    margin: 0;
    max-width: 62ch;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-3);
  }

  /* due colonne quando ci stanno: un agente per colonna, e nessuno stretto */
  .grid {
    max-width: 960px;
    margin: 0 auto;
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
    align-items: start;
  }

  .card {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .card.is-new {
    padding: 14px;
    border-radius: var(--r-md);
    border: 1px dashed var(--hairline);
  }

  .where { margin: 0; font-size: 11.5px; color: var(--ink-3); }

  .where b { font-weight: 560; color: var(--ink-2); }

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
</style>
