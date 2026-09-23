<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { agentPath } from '../lib/routing';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import AddRow from './AddRow.svelte';
  import AgentControls from './AgentControls.svelte';
  import AgentLog from './AgentLog.svelte';
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

  /**
   * Spostarlo, o toglierlo da dove sta.
   *
   * Un agente sta su un luogo solo, quindi scegliere il nuovo vuol dire anche
   * andarsene dal vecchio: il selettore dice dove sta adesso, e cambiarlo lo
   * sposta.
   */
  async function move(agent: Agent, placeId: string) {
    try {
      await store.moveAgent(agent.id, placeId || null);
      const dove = placeId ? store.places.find((place) => place.id === placeId)?.name : null;
      toast.show(dove ? `«${agent.name}» sta su «${dove}»` : `«${agent.name}» non sta più su nessun luogo`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1600);
    } catch {
      toast.show('Copia non riuscita, il comando è quello che vedi');
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
      toast.show("Token nuovo. L'agente va reinstallato con questo comando.");
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

<PageShell
  title="Agenti"
  lead="Un agente è il servizio che installi su una macchina accesa in un luogo. Trova i dispositivi sulla rete di casa e si collega qui da solo. Ne servono due quando le reti sono separate."
>
  {#each devices.agents as agent (agent.id)}
    {@const where = placeOf(agent)}
    <section class="card">
      <AgentControls {agent}>
        {#snippet trail()}
          <!-- la sua pagina, dove le telecamere sono grandi e i comandi
               stanno sotto le immagini invece che in coda a una colonna -->
          <Button look="icon" href={agentPath(agent.id)} title="Apri questo agente">
            <Icon name="full" />
          </Button>
          <!-- Dove sta, si cambia da qui. Prima bisognava aprire la scheda
               del luogo dove stava per staccarlo e poi quella dell'altro per
               rimetterlo, e per farlo bisognava ricordarsi dove fosse. -->
          {#if where}
            <Button
              look="icon"
              title="Stacca dal luogo"
              onclick={(event: MouseEvent) =>
                ui.askSure(event.currentTarget as HTMLElement, {
                  title: `Staccarlo da “${where.name}”?`,
                  detail:
                    "L'agente resta e continua a funzionare. Quel luogo smette solo di mostrarlo, e lo puoi rimettere lì o altrove.",
                  verb: 'Stacca',
                  tone: 'plain',
                  no: 'Annulla',
                  onYes: () => void move(agent, ''),
                })}
            >
              <Icon name="logout" />
            </Button>
          {:else}
            <Button
              look="icon"
              extra="pick-btn"
              title="Mettilo su un luogo"
              disabled={!store.places.length}
              onclick={(event: MouseEvent) =>
                ui.askPick(event.currentTarget as HTMLElement, {
                  title: 'Su quale luogo?',
                  options: store.places.map((place) => ({
                    id: place.id,
                    label: place.name,
                    note: (place.agentIds ?? []).length ? 'ha già un agente' : undefined,
                  })),
                  onPick: (id: string) => void move(agent, id),
                })}
            >
              <Icon name="pin" />
            </Button>
          {/if}
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
                no: 'Annulla',
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
              Non sta su nessun luogo
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
                Si vede una volta sola, perché dentro c'è il token e qui ne resta solo un'impronta.
                Vuole <b>Linux</b> — su Windows incollala dentro WSL.
              </p>
            </div>
          {/if}

          <AgentPairing {agent} />

          <AgentLog {agent} />
        {/snippet}
      </AgentControls>
    </section>
  {/each}

  <PageCard dashed>
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
  </PageCard>
</PageShell>

<style>
  .card {
    /* una card non si spezza in fondo a una colonna per continuare in cima
       all'altra: si sposta intera */
    break-inside: avoid;
    /* lo spazio verticale è suo, non della colonna: il gap qui non esiste */
    margin-bottom: 14px;
    display: grid;
    gap: 10px;
    min-width: 0;
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
