<script lang="ts">
  import { auth } from './lib/auth.svelte';
  import { devices } from './lib/devices.svelte';
  import { live } from './lib/live.svelte';
  import { readRoute } from './lib/routing';
  import { store } from './lib/store.svelte';
  import { toast } from './lib/toast.svelte';
  import { ui } from './lib/ui.svelte';
  import AddButton from './components/AddButton.svelte';
  import ColorPopover from './components/ColorPopover.svelte';
  import EmojiPopover from './components/EmojiPopover.svelte';
  import Hint from './components/Hint.svelte';
  import LoginScreen from './components/LoginScreen.svelte';
  import PublicMap from './components/PublicMap.svelte';
  import PublicProfile from './components/PublicProfile.svelte';
  import AgentsPage from './components/AgentsPage.svelte';
  import ManageSheet from './components/ManageSheet.svelte';
  import MapCanvas from './components/MapCanvas.svelte';
  import Palette from './components/Palette.svelte';
  import Panel from './components/Panel.svelte';
  import PlaceSheet from './components/PlaceSheet.svelte';
  import SurePopover from './components/SurePopover.svelte';
  import GuestBar from './components/GuestBar.svelte';
  import Toast from './components/Toast.svelte';

  /** /m/<slug> e /u/<handle> sono pubblici: non chiedono nulla a nessuno. */
  const route = readRoute();

  /** Le pagine che sono l'app: vogliono sapere chi sei prima di disegnare. */
  const mine = route.kind === 'app' || route.kind === 'agents';

  // Prima si vede chi c'è: l'indice si carica solo per chi è entrato, e si
  // ricarica se rientra con un altro account. Senza questo la pagina degli
  // agenti restava bianca: nessuno aveva chiesto chi fosse.
  if (mine) auth.load();

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
    live.start();
    return () => live.stop();
  });

  // The map cursor and the bottom-of-screen rules read these off the body.
  $effect(() => {
    document.body.classList.toggle('picking', ui.picking);
    document.body.classList.toggle('sheet-open', ui.sheet !== 'none');
  });

  /**
   * On a narrow screen an open sheet covers the bottom, where the map chrome
   * lives. The zoom hides; the attribution is not optional, so it is pushed up
   * by exactly the height of the sheet — which changes as the sheet grows.
   */
  $effect(() => {
    // effects run after the DOM settles, so the open sheet is already there
    const which = ui.sheet;
    const node = which === 'none' ? null : document.querySelector<HTMLElement>(`#${which}-sheet`);
    if (!node) {
      document.body.style.removeProperty('--sheet-h');
      return;
    }
    const measure = () =>
      document.body.style.setProperty('--sheet-h', `${Math.round(node.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });

  /**
   * Il picker emoji carica e indicizza 440KB di dati: crearlo alla prima
   * apertura evita il costo a chi non lo usa, e non distruggerlo più evita
   * di rifarlo ogni volta.
   */
  let emojiEverOpened = $state(false);
  $effect(() => {
    if (ui.emoji) emojiEverOpened = true;
  });

  function onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      ui.paletteOpen = !ui.paletteOpen;
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ui.sheet === 'place') {
      event.preventDefault();
      document.querySelector<HTMLFormElement>('#place-form')?.requestSubmit();
      return;
    }
    if (event.key === 'Escape') ui.escape();
  }

  /** A click anywhere else closes whichever popover is open. */
  function onPointerdown(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (ui.emoji && !target.closest('#emoji-popover') && !target.closest('.emoji-btn')) ui.emoji = null;
    if (ui.color && !target.closest('#color-popover') && !target.closest('.swatch')) ui.color = null;
    if (ui.sure && !target.closest('#sure-popover') && !target.closest('.kill')) ui.sure = null;
  }
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerdown} />

{#if route.kind === 'map'}
  <PublicMap handle={route.handle} slug={route.slug} />
{:else if route.kind === 'profile'}
  <PublicProfile handle={route.handle} />
{:else if auth.checking}
  <!-- un istante di niente: meglio del lampo della porta a chi è già dentro -->
{:else if !auth.account}
  <LoginScreen />
{:else if route.kind === 'agents'}
  <GuestBar />
  <AgentsPage />
{:else}
  <GuestBar />
  <MapCanvas />
  <Panel />
<AddButton />
<Hint />

  {#if ui.sheet === 'place' && ui.draft}
    <PlaceSheet />
  {:else if ui.sheet === 'manage'}
    <ManageSheet />
  {/if}

  {#if ui.paletteOpen}<Palette />{/if}
  {#if emojiEverOpened}<EmojiPopover />{/if}
  {#if ui.color}<ColorPopover />{/if}
{/if}

<!-- La domanda prima di una cosa: è di tutta l'app, non della sola mappa.
     Stava dentro al ramo della mappa, e nella pagina degli agenti i tasti
     avrebbero chiesto conferma a nessuno. -->
{#if ui.sure}<SurePopover />{/if}

<Toast />
