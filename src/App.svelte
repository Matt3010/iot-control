<script lang="ts">
  import { auth } from './lib/auth.svelte';
  import { devices } from './lib/devices.svelte';
  import { live } from './lib/live.svelte';
  import { nav } from './lib/nav.svelte';
  import { store } from './lib/store.svelte';
  import { toast } from './lib/toast.svelte';
  import { ui } from './lib/ui.svelte';
  import { viewport } from './lib/viewport.svelte';
  import AddButton from './components/AddButton.svelte';
  import ColorPopover from './components/ColorPopover.svelte';
  import MarkPopover from './components/MarkPopover.svelte';
  import PickPopover from './components/PickPopover.svelte';
  import Hint from './components/Hint.svelte';
  import LoginScreen from './components/LoginScreen.svelte';
  import AgentPage from './components/AgentPage.svelte';
  import AccountPage from './components/AccountPage.svelte';
  import AgentsPage from './components/AgentsPage.svelte';
  import MapsPage from './components/MapsPage.svelte';
  import ScenesPage from './components/ScenesPage.svelte';
  import AlertsPage from './components/AlertsPage.svelte';
  import ManageSheet from './components/ManageSheet.svelte';
  import Modal from './components/Modal.svelte';

  /*
   * Quale componente mostra la finestra di categorie e gruppi.
   *
   * Si dice qui e non dentro all'archivio dello stato: se quello importasse
   * una schermata, i due si terrebbero per mano e nessuno dei due si
   * potrebbe leggere da solo. Da qui in giu' nessuno sa cosa ci sia dentro
   * a quella finestra.
   */
  ui.manageView = ManageSheet;
  ui.placeView = PlaceSheet;
  import MapCanvas from './components/MapCanvas.svelte';
  import Palette from './components/Palette.svelte';
  import Panel from './components/Panel.svelte';
  import PlaceSheet from './components/PlaceSheet.svelte';
  import SurePopover from './components/SurePopover.svelte';
  import GuestBar from './components/GuestBar.svelte';
  import Toast from './components/Toast.svelte';

  /**
   * Dove siamo adesso. Cambia mentre si guarda: fra le pagine di casa si
   * passa senza ricaricare, e quello che sta già in memoria — chi sei,
   * l'indice, il filo dei dispositivi — resta dov'è.
   */
  const route = $derived(nav.route);

  // Prima si vede chi c'è: l'indice si carica solo per chi è entrato, e si
  // ricarica se rientra con un altro account. Senza questo la pagina degli
  // agenti restava bianca, perché nessuno aveva chiesto chi fosse.
  auth.load();

  $effect(() => {
    if (!auth.account) return;
    // di chi è l'indice che stiamo per caricare: se non è quello di prima,
    // questo browser dimentica cosa guardava
    store.settle(auth.account.actingAs?.ownerId ?? auth.account.id);
    store.load().catch((error: Error) => toast.show(`Caricamento fallito: ${error.message}`));

    // Si chiede una volta com'è messo il mondo, e da lì in poi arriva tutto
    // da un filo aperto: gli interruttori, e anche i luoghi che cambi da
    // un'altra scheda.
    void devices.load();
    // le regole sono poche e non cambiano da sole: si leggono una volta
    void devices.loadRules();
    live.start();
    return () => live.stop();
  });

  /*
   * Cambiare pagina chiude quello che sta davanti.
   *
   * La finestra galleggia sopra a tutta l'applicazione, non sopra una
   * schermata: da «Gestisci tutti gli agenti» si finiva nella pagina degli
   * agenti con la scheda del luogo ancora appesa in un angolo, con dentro
   * un «Salva» che parlava di una schermata che non era piu' li'.
   */
  let eravamo = nav.path;
  $effect(() => {
    const siamo = nav.path;
    if (siamo === eravamo) return;
    eravamo = siamo;
    ui.closeModal();
  });

  // Il cursore della mappa e le regole del fondo schermo si leggono da qui.
  $effect(() => {
    document.body.classList.toggle('picking', ui.picking);
    // «c'è una finestra davanti», che è quello che serve sapere in fondo a
    // un telefono, dove il tasto che aggiunge un luogo le finirebbe sotto
    document.body.classList.toggle('sheet-open', ui.modal !== null);
  });

  function onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      ui.paletteOpen = !ui.paletteOpen;
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ui.draft) {
      event.preventDefault();
      document.querySelector<HTMLFormElement>('#place-form')?.requestSubmit();
      return;
    }
    if (event.key === 'Escape') ui.escape();
  }

  /** A click anywhere else closes whichever popover is open. */
</script>

<svelte:window onkeydown={onKeydown} />

{#if auth.checking}
  <!-- un istante di niente: meglio del lampo della porta a chi è già dentro -->
{:else if !auth.account}
  <LoginScreen />
{:else if route.kind === 'agents'}
  <GuestBar />
  <AgentsPage />
{:else if route.kind === 'agent'}
  <GuestBar />
  <AgentPage id={route.id} />
{:else if route.kind === 'maps'}
  <GuestBar />
  <MapsPage />
{:else if route.kind === 'scenes'}
  <GuestBar />
  <ScenesPage />
{:else if route.kind === 'alerts'}
  <GuestBar />
  <AlertsPage />
{:else if route.kind === 'account'}
  <AccountPage />
{:else}
  <GuestBar />
  <!--
    Su un telefono la mappa non c'è.
    Non è una mappa rimpicciolita: è un francobollo con sopra un pannello che
    ne copre metà, dove i pin sono grandi come un'unghia e si prende sempre
    quello sbagliato. Quello che si fa davvero da fermi in strada è leggere un
    elenco — questo posto, quanto dista, aprilo — e l'elenco c'era già: qui
    smette di essere l'inquilino di mezzo pannello e prende tutto lo schermo.
  -->
  {#if viewport.hasMap}
    <MapCanvas />
  {/if}
  <Panel />
  <AddButton />
  <!-- il suggerimento spiega come si tocca la mappa, quindi vive dove la
       mappa c'è -->
  {#if viewport.hasMap}
    <Hint />
  {/if}

  {#if ui.paletteOpen}<Palette />{/if}
  <!-- Il selettore dei segni si monta quando serve e sparisce quando no: è
       una griglia di cinquanta disegni, non c'è niente da tenere in caldo. -->
  {#if ui.mark}<MarkPopover />{/if}
  {#if ui.color}<ColorPopover />{/if}
{/if}

<!-- La domanda prima di una cosa: è di tutta l'app, non della sola mappa.
     Stava dentro al ramo della mappa, e nella pagina degli agenti i tasti
     avrebbero chiesto conferma a nessuno. -->
<!-- La finestra: la apre chi ne ha bisogno passandole un componente, e da qui
     in giù nessuno sa cosa ci sia dentro. Come la domanda qui sotto, è di
     tutta l'app: stava dentro al ramo della mappa, e nelle pagine degli
     agenti, delle mappe, delle scene e degli avvisi chi la apriva non vedeva
     comparire niente. -->
<!-- `key` e non solo `if`: una finestra nuova è un guscio nuovo. Tenendo lo
     stesso, i tasti in fondo restavano quelli dettati da chi c'era prima, e
     categorie e gruppi si ritrovava in fondo «Elimina luogo». -->
{#key ui.modal}
  {#if ui.modal}<Modal />{/if}
{/key}

{#if ui.sure}<SurePopover />{/if}
<!-- E la scelta fra cose che hai creato tu, che e' la stessa domanda con dei
     nomi al posto del si' e del no. -->
{#if ui.pick}<PickPopover />{/if}

<Toast />
