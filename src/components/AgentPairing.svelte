<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { CatalogEntry } from '../../shared/protocol';
  import { providerDa, type Provider } from '../lib/providers';
  import { ui } from '../lib/ui.svelte';
  import CatalogPicker from './CatalogPicker.svelte';
  import type { Health, LinkedAccount } from '../lib/types';
  import AccountList from './AccountList.svelte';
  import PairingFlow from './PairingFlow.svelte';

  /**
   * Collegare qualcosa a un agente, senza uscire da qui.
   *
   * Questo pezzo sa solo due cose: cosa si può collegare, e cosa è collegato
   * adesso. L'elenco lo disegna uno; la conversazione per collegare la fa un
   * altro, e vive quanto lei. Quando ha finito, qui si rilegge cosa c'è.
   *
   * Nei testi non si nomina mai cosa gira dentro l'agente: chi guarda questa
   * pagina non deve sapere cosa c'è là sotto — per lui c'è l'agente, che sta
   * in un posto e collega le cose. Anche gli errori che salgono da laggiù
   * parlano così; il nome vero resta nel registro della macchina, che è dove
   * serve.
   */
  let { agent }: { agent: Agent } = $props();


  /**
   * Quello che la finestra mostra: cosa è collegato, cosa si può collegare,
   * e se c'è un comando in corso. Un oggetto solo e vivo, perché la finestra
   * lo riceve una volta sola quando si apre, e dopo uno «Scollega» deve
   * vedere l'elenco nuovo senza riaprirsi.
   */
  const stato = $state<{ linked: LinkedAccount[]; catalogo: CatalogEntry[]; busy: boolean }>({
    linked: [],
    catalogo: [],
    busy: false,
  });

  /** La conversazione aperta adesso, se ce n'è una, e se riprende quella di un account scaduto. */
  let open = $state<{ provider: Provider; riprendi?: string } | null>(null);

  $effect(() => {
    if (!agent.online) return;
    // e di nuovo ogni volta che il server dice che gli account sono cambiati
    void devices.versioniAccount[agent.id];
    void devices
      .linked(agent)
      .then((list) => (stato.linked = list))
      .catch(() => undefined);
    void devices
      .catalog(agent)
      .then((list) => (stato.catalogo = list))
      .catch(() => undefined);
  });

  /** Collegati e da collegare, nella stessa finestra. */
  function cerca(): void {
    ui.openModal({
      title: 'Collega qualcosa',
      view: CatalogPicker,
      props: {
        agent,
        stato,
        onpick: (provider: Provider) => (open = { provider }),
        onoff: (joint: LinkedAccount, label: string) => void detach(joint, label),
        onricollega: ricollega,
      },
    });
  }

  /** Rientrare in un account scaduto: si riprende la conversazione che la centrale ha aperto. */
  const ricollega = (joint: LinkedAccount, provider: Provider): void => {
    ui.closeModal();
    open = { provider, riprendi: joint.ricollega };
  };

  /*
   * Gli account da ricollegare stanno anche nella scheda, sopra a «Collega
   * qualcosa»: un account scaduto nascosto dentro una finestra è un account
   * che nessuno ricollega. Gli altri guasti — una telecamera spenta — non
   * hanno niente da premere: li dice il pallino, e il dettaglio è nella
   * finestra.
   */
  const guasti = $derived(stato.linked.filter((one) => !!one.ricollega));

  /** Il peggiore fra tutti, per il pallino della riga: rosso batte arancione, che batte verde. */
  const riassunto = $derived.by((): Health | undefined => {
    if (!stato.linked.length) return undefined;
    const stati = stato.linked.map((one) => one.health ?? 'live');
    return stati.includes('lost') ? 'lost' : stati.includes('degraded') ? 'degraded' : stati.includes('new') ? 'new' : 'live';
  });
  const loro = $derived(
    [...new Set(guasti.map((one) => one.handler))].map((handler) =>
      providerDa(handler, guasti.find((one) => one.handler === handler)?.name ?? stato.catalogo.find((voce) => voce.handler === handler)?.name),
    ),
  );

  const reread = async (): Promise<void> => {
    stato.linked = await devices.linked(agent).catch(() => stato.linked);
  };

  async function detach(joint: LinkedAccount, label: string): Promise<void> {
    stato.busy = true;
    try {
      stato.linked = await devices.unlink(agent, joint.entryId);
      toast.show(`${label} si scollega, e i suoi dispositivi se ne vanno`);
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      stato.busy = false;
    }
  }
</script>

{#if open}
  <PairingFlow
    {agent}
    provider={open.provider}
    riprendi={open.riprendi}
    onquit={() => (open = null)}
    ondone={() => {
      open = null;
      void reread();
    }}
  />
{:else}
  <!-- nella scheda una riga sola: cosa è collegato e cosa si può collegare stanno nella finestra -->
  <AccountList {agent} accounts={loro} linked={guasti} busy={stato.busy} altre={cerca} onricollega={ricollega} {riassunto} />
{/if}
