<script lang="ts">
  import { untrack } from 'svelte';
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { CatalogEntry } from '../../shared/protocol';
  import { providerDa, type Provider } from '../lib/providers';
  import { scarica, ui, type ModalRequest } from '../lib/ui.svelte';
  import type { Health, LinkedAccount } from '../lib/types';
  import AccountList from './AccountList.svelte';

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

  /**
   * La conversazione per collegare, in una finestra come tutto il resto che
   * si apre davanti. Se riprende quella di un account scaduto, lo dice il
   * titolo. Partita dal catalogo, ci si appoggia sopra (lo decide
   * `ui.openModal`), e chiusa questa si torna lì, con l'elenco già riletto.
   *
   * Chiude la sua finestra e non quella davanti: la conversazione aspetta
   * l'agente, e nel frattempo se ne poteva aprire un'altra.
   */
  async function apri(provider: Provider, riprendi?: string): Promise<void> {
    // la conversazione e il suo QR si scaricano la prima volta che servono
    const PairingFlow = await scarica(() => import('./PairingFlow.svelte'));
    if (!PairingFlow) return;
    const finestra: ModalRequest = {
      title: riprendi ? `Ricollega ${provider.label}` : provider.label,
      view: PairingFlow,
      props: {
        agent,
        provider,
        riprendi,
        onquit: () => ui.closeModal(finestra),
        ondone: () => {
          ui.closeModal(finestra);
          void reread();
        },
      },
    };
    ui.openModal(finestra);
  }

  /*
   * Cosa c'è e cosa si può collegare, chiesto all'agente quando si collega e
   * di nuovo ogni volta che il server dice che gli account sono cambiati.
   *
   * Dipende dall'identità dell'agente e dal suo essere collegato, non
   * dall'oggetto: ogni rilettura dell'elenco ne porta uno nuovo, e le due
   * domande ripartivano a ogni evento del filo. E vince l'ultima domanda
   * fatta, non l'ultima risposta arrivata: una lenta di prima non deve
   * coprirne una fresca.
   */
  const agentId = $derived(agent.id);
  const online = $derived(agent.online);
  let giro = 0;

  $effect(() => {
    if (!online) return;
    void devices.versioniAccount[agentId];
    const mio = ++giro;
    const questo = untrack(() => agent);
    void devices
      .linked(questo)
      .then((list) => mio === giro && (stato.linked = list))
      .catch(() => undefined);
    void devices
      .catalog(questo)
      .then((list) => mio === giro && (stato.catalogo = list))
      .catch(() => undefined);
  });

  /** Collegati e da collegare, nella stessa finestra. */
  async function cerca(): Promise<void> {
    const CatalogPicker = await scarica(() => import('./CatalogPicker.svelte'));
    if (!CatalogPicker) return;
    ui.openModal({
      title: 'Collega un servizio',
      view: CatalogPicker,
      props: {
        agent,
        stato,
        onpick: (provider: Provider) => void apri(provider),
        onoff: (joint: LinkedAccount, label: string) => void detach(joint, label),
        onricollega: ricollega,
      },
    });
  }

  /** Rientrare in un account scaduto: si riprende la conversazione che la centrale ha aperto. */
  const ricollega = (joint: LinkedAccount, provider: Provider): void => void apri(provider, joint.ricollega);

  /*
   * Gli account da ricollegare stanno anche nella scheda, sopra a «Collega
   * un servizio»: un account scaduto nascosto dentro una finestra è un account
   * che nessuno ricollega. Gli altri guasti — una telecamera spenta — non
   * hanno niente da premere: li dice il pallino, e il dettaglio è nella
   * finestra.
   */
  const guasti = $derived(stato.linked.filter((one) => !!one.ricollega));

  /*
   * Come stanno tutti insieme, per il pallino della riga: verde se funziona
   * tutto, arancione se almeno uno no, rosso se non ne funziona nessuno.
   * Un rosso per una telecamera spenta fra sei collegamenti sani diceva
   * «non funziona niente», che non era vero.
   */
  const riassunto = $derived.by((): Health | undefined => {
    if (!stato.linked.length) return undefined;
    const fermi = stato.linked.filter((one) => (one.health ?? 'live') !== 'live' || !!one.ricollega).length;
    return fermi === 0 ? 'live' : fermi === stato.linked.length ? 'lost' : 'degraded';
  });
  const loro = $derived(
    [...new Set(guasti.map((one) => one.handler))].map((handler) =>
      providerDa(handler, guasti.find((one) => one.handler === handler)?.name ?? stato.catalogo.find((voce) => voce.handler === handler)?.name),
    ),
  );

  const reread = async (): Promise<void> => {
    const mio = ++giro;
    const list = await devices.linked(agent).catch(() => null);
    if (list && mio === giro) stato.linked = list;
  };

  async function detach(joint: LinkedAccount, label: string): Promise<void> {
    stato.busy = true;
    try {
      const list = await devices.unlink(agent, joint.entryId);
      // la risposta di chi ha appena scollegato è la più fresca di tutte
      giro += 1;
      stato.linked = list;
      toast.show(`${label} si scollega. I dispositivi restano come spariti finché non li rimuovi.`);
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      stato.busy = false;
    }
  }
</script>

<!-- nella scheda una riga sola: cosa è collegato e cosa si può collegare stanno nella finestra -->
<AccountList {agent} accounts={loro} linked={guasti} busy={stato.busy} altre={cerca} onricollega={ricollega} {riassunto} />

