<script lang="ts">
  import StaleNote from './StaleNote.svelte';
  import { auth } from '../lib/auth.svelte';
  import { devices, type Agent } from '../lib/devices.svelte';
  import { agentPath } from '../lib/routing';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import { chiediElimina, chiediRigenera, chiediStacca, Installazione, placeOf } from '../lib/agenti.svelte';
  import { vistaAgenti } from '../lib/viste.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import AddRow from './AddRow.svelte';
  import AgentControls from './AgentControls.svelte';
  import AgentLog from './AgentLog.svelte';
  import AgentPairing from './AgentPairing.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import InstallCommand from './InstallCommand.svelte';
  import ViewControls from './ViewControls.svelte';

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
  const installa = new Installazione();

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

  async function create(name: string) {
    if (await installa.create(name)) newName = '';
  }
</script>

<PageShell
  title="Agenti"
  lead="Un agente è il servizio che installi su una macchina accesa in un luogo. Trova i dispositivi sulla rete di casa e si collega qui da solo. Ne servono due quando le reti sono separate."
>
  {#snippet meta()}<StaleNote />{/snippet}
  {#snippet tools()}<ViewControls vista={vistaAgenti} label="In che ordine gli agenti" />{/snippet}

  {#each vistaAgenti.applica(devices.agents) as agent (agent.id)}
    {@const where = placeOf(agent)}
    <PageCard bare>
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
                chiediStacca(event.currentTarget as HTMLElement, where.name, () => void move(agent, ''))}
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
                  // da ospite, solo i luoghi che puoi toccare: gli altri il server li rifiuta
                  options: store.places.filter((place) => auth.canTouch(place.id)).map((place) => ({
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
          <!-- il token e l'agente stesso sono di chi possiede l'indice -->
          {#if auth.canAdmin}
            <Button
              look="icon"
              title="Rigenera il token"
              onclick={(event: MouseEvent) =>
                chiediRigenera(event.currentTarget as HTMLElement, () => void installa.rotate(agent))}
            >
              <Icon name="refresh" />
            </Button>
            <Button
              look="icon"
              tone="danger"
              extra="kill"
              title="Elimina agente"
              onclick={(event: MouseEvent) =>
                chiediElimina(event.currentTarget as HTMLElement, agent, () => void devices.removeAgent(agent))}
            >
              <Icon name="trash" />
            </Button>
          {/if}
        {/snippet}

        {#snippet foot()}
          <p class="where">
            {#if where}
              Sta su <b>{where.name}</b>
            {:else}
              Non sta su nessun luogo
            {/if}
          </p>

          {#if installa.fresh?.id === agent.id}
            <InstallCommand install={installa.fresh.install} />
          {/if}

          <AgentPairing {agent} />

          <AgentLog {agent} />
        {/snippet}
      </AgentControls>
    </PageCard>
  {/each}

  <!-- un agente nuovo lo installa chi possiede l'indice: da ospite il riquadro non c'è -->
  {#if auth.canAdmin}
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
  {/if}
</PageShell>

<style>
  .where { margin: 0; font-size: 11.5px; color: var(--ink-3); }

  .where b { font-weight: 560; color: var(--ink-2); }

  .once { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }
</style>
