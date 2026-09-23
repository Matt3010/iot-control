<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { Account, LinkedAccount } from '../lib/types';
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
   * Cosa si può collegare, e cosa comporta collegarlo. Il secondo non è un
   * dettaglio: aggiungere eWeLink scarica un'integrazione di terze parti su
   * quella macchina e la fa riavviare, e chi preme deve saperlo prima.
   */
  const ACCOUNTS: readonly Account[] = [
    {
      handler: 'tuya',
      label: 'Tuya',
      /** Di account ce n'è uno: quello con cui sei entrato. */
      many: false,
      more: '',
      warns: "Ti verrà chiesto il codice che sta nell'app Smart Life, e poi un QR da inquadrare.",
    },
    {
      handler: 'sonoff',
      label: 'eWeLink',
      many: false,
      more: '',
      warns:
        "La prima volta l'agente aggiunge il supporto eWeLink e si riavvia, e ci vuole un minuto. Poi ti chiederà le credenziali dell'app.",
    },
    {
      handler: 'generic',
      label: 'Telecamera',
      /**
       * Di telecamere invece ce ne sono quante ne ha il registratore, una per
       * canale, e ognuna è un collegamento a sé: si stacca da sola, senza
       * portarsi via le altre.
       */
      many: true,
      more: 'Un’altra telecamera',
      warns:
        "Ti chiederà l'indirizzo del flusso — di solito una riga che comincia per rtsp:// — e come raggiungerlo. Si fa una telecamera per volta, quindi con un registratore da quattro si ripete quattro volte.",
    },
  ];

  /** Cosa è già collegato: si chiede una volta, e si rilegge quando cambia. */
  let linked = $state<LinkedAccount[]>([]);
  /** La conversazione aperta adesso, se ce n'è una. */
  let open = $state<Account | null>(null);
  let busy = $state(false);

  $effect(() => {
    if (!agent.online) return;
    void devices
      .linked(agent)
      .then((list) => (linked = list))
      .catch(() => undefined);
  });

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
    handler={open.handler}
    label={open.label}
    onquit={() => (open = null)}
    ondone={() => {
      open = null;
      void reread();
    }}
  />
{:else}
  <AccountList
    {agent}
    accounts={ACCOUNTS}
    {linked}
    {busy}
    onbegin={(account) => (open = account)}
    onoff={(joint, label) => void detach(joint, label)}
  />
{/if}
