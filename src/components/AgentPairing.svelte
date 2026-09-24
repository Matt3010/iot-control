<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { CatalogEntry } from '../../shared/protocol';
  import { nelRegistro, providerDa, PROVIDERS, type Provider } from '../lib/providers';
  import { ui } from '../lib/ui.svelte';
  import CatalogPicker from './CatalogPicker.svelte';
  import type { LinkedAccount } from '../lib/types';
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


  /** Cosa è già collegato: si chiede una volta, e si rilegge quando cambia. */
  let linked = $state<LinkedAccount[]>([]);
  /** La conversazione aperta adesso, se ce n'è una. */
  let open = $state<Provider | null>(null);
  let busy = $state(false);

  /** Tutto quello che la centrale di quell'agente sa collegare. Si chiede una volta. */
  let catalogo = $state<CatalogEntry[]>([]);

  $effect(() => {
    if (!agent.online) return;
    void devices
      .linked(agent)
      .then((list) => (linked = list))
      .catch(() => undefined);
    void devices
      .catalog(agent)
      .then((list) => (catalogo = list))
      .catch(() => undefined);
  });

  /*
   * Una riga per ogni marca già collegata, con il nome nostro se è del
   * registro, se no con quello del catalogo. Quelle da collegare stanno
   * tutte nella ricerca.
   */
  const accounts = $derived(
    [...new Set(linked.map((one) => one.handler))].map((handler) =>
      providerDa(handler, catalogo.find((voce) => voce.handler === handler)?.name),
    ),
  );

  /*
   * Quello che si può cercare: il catalogo della centrale, con le voci del
   * registro sopra alle sue (i nostri nomi — «Telecamera» e non «Generic
   * Camera») e in più quelle che la centrale ancora non ha, come eWeLink
   * prima di installarlo.
   */
  const cercabili = $derived([
    ...PROVIDERS.map((one) => ({ handler: one.handler, name: one.label })),
    ...catalogo.filter((voce) => !nelRegistro(voce.handler)),
  ]);

  /** Le altre marche, cercando nel catalogo. La conversazione è la stessa di quelle del registro. */
  function altre(): void {
    ui.openModal({
      title: 'Collega una marca',
      view: CatalogPicker,
      props: {
        voci: cercabili,
        onpick: (voce: CatalogEntry) => (open = providerDa(voce.handler, voce.name)),
      },
    });
  }

  const reread = async (): Promise<void> => {
    linked = await devices.linked(agent).catch(() => linked);
  };

  async function detach(joint: LinkedAccount, label: string): Promise<void> {
    busy = true;
    try {
      linked = await devices.unlink(agent, joint.entryId);
      toast.show(`${label} si scollega, e i suoi dispositivi se ne vanno`);
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <PairingFlow
    {agent}
    provider={open}
    onquit={() => (open = null)}
    ondone={() => {
      open = null;
      void reread();
    }}
  />
{:else}
  <AccountList
    {agent}
    {accounts}
    {altre}
    {linked}
    {busy}
    onoff={(joint, label) => void detach(joint, label)}
  />
{/if}
