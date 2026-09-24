<script lang="ts">
  import { untrack } from 'svelte';
  import { portal } from '../lib/portal';
  import { MAPS_PATH } from '../lib/routing';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import AddRow from './AddRow.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let creating = $state(false);
  let newName = $state('');
  let field = $state<HTMLInputElement>();

  /**
   * Il menu non puo' vivere dentro il pannello: il pannello ritaglia quello
   * che esce dai suoi bordi, e il menu veniva tagliato a meta'. Sta appeso al
   * corpo della pagina, e si mette da solo sotto al tasto che l'ha aperto.
   */
  let anchor = $state<HTMLElement>();
  let menu = $state<HTMLElement>();
  let at = $state({ left: 0, top: 0, width: 240 });

  function apri() {
    if (open) return (open = false);
    const r = anchor!.getBoundingClientRect();
    at = { left: Math.max(8, r.left - 6), top: r.bottom + 8, width: Math.max(240, r.width + 12) };
    open = true;
  }

  /**
   * Se sotto non ci sta, si apre all'insu': meglio sopra che fuori schermo.
   *
   * La posizione si calcola dal tasto, non da quella di prima. Leggendo `at`
   * e riscrivendolo, un menu più alto della finestra non stava né sotto né
   * sopra, e l'effetto si rincorreva da solo finché Svelte non lo fermava.
   */
  $effect(() => {
    if (!open || !menu) return;
    const alto = menu.offsetHeight;
    const r = anchor!.getBoundingClientRect();
    const sotto = r.bottom + 8;
    const top = sotto + alto <= window.innerHeight - 8 ? sotto : Math.max(8, r.top - 8 - alto);
    untrack(() => {
      if (at.top !== top) at = { ...at, top };
    });
  });

  $effect(() => {
    if (creating) field?.focus();
  });

  // aperto, si chiude con Esc come ogni cosa che sta sopra (`ui.sopra`)
  $effect(() => {
    if (!open) return;
    return ui.sopra(() => (open = false));
  });

  async function create(name: string) {
    try {
      const created = await store.createMap(name);
      newName = '';
      creating = false;
      open = false;
      toast.show(`"${created.name}" è la mappa selezionata`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  function choose(id: string) {
    store.openMap(id);
    open = false;
    ui.closePlace();
  }
</script>

<div class="switcher">
  <button
    class="current"
    type="button"
    bind:this={anchor}
    aria-expanded={open}
    title={store.shownMaps.length > 1 ? `Stai guardando ${store.shownMaps.length} mappe` : 'Cambia mappa'}
    onclick={apri}
  >
    <Icon name={store.extraMapIds.length ? 'layers' : 'pin'} />
    <span class="current-name">{store.activeMap?.name ?? 'Place Index'}</span>
    <Icon name={open ? 'collapse' : 'expand'} />
  </button>

  {#if open}
    <div class="pop" use:portal>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="veil" onclick={() => (open = false)}></div>
      <div
        class="menu surface"
        bind:this={menu}
        style:left="{at.left}px"
        style:top="{at.top}px"
        style:width="{at.width}px"
      >
      <span class="eyebrow">Le tue mappe</span>
      <ul>
        {#each store.maps as map (map.id)}
          {@const here = map.id === store.activeMap?.id}
          {@const shown = store.shows(map.id)}
          <li class:is-on={here} class:is-shown={shown}>
            <button
              type="button"
              class="entry"
              title={here ? 'È la mappa selezionata' : 'Guarda solo questa'}
              onclick={() => choose(map.id)}
            >
              <span class="entry-name">{map.name}</span>
              <span class="entry-count">
                {store.places.filter((place) => place.mapId === map.id).length}
              </span>
            </button>
            <button
              type="button"
              class="eye"
              disabled={here}
              title={here
                ? 'La mappa selezionata si vede sempre'
                : shown
                  ? 'Smetti di mostrarla accanto'
                  : 'Mostra anche questa'}
              onclick={() => store.toggleShown(map.id)}
            >
              <Icon name={shown ? 'eye' : 'eyeOff'} />
            </button>
          </li>
        {/each}
      </ul>

      <a class="new" href={MAPS_PATH} onclick={() => (open = false)}>
        <Icon name="link" /> Condividi e gestisci
      </a>

      {#if creating}
        <AddRow
          placeholder="Nome della nuova mappa"
          title="Crea mappa"
          bind:value={newName}
          bind:field={field}
          onadd={create}
        />
      {:else}
        <button type="button" class="new" onclick={() => (creating = true)}>
          <Icon name="plus" /> Nuova mappa
        </button>
      {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* il nome della mappa si prende tutto lo spazio che avanza in testata */
  .switcher { position: relative; flex: 1 1 auto; min-width: 0; }

  .current {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    padding: 3px 8px 3px 6px;
    margin-left: -6px;
    border: 0;
    border-radius: 99px;
    background: none;
    font-size: 13.5px;
    font-weight: 620;
    letter-spacing: -0.02em;
    transition: background 0.15s;
  }

  .current:hover { background: var(--sunken-hover); }

  /* il nome della mappa si preme per cambiarla: dove si tocca, è alto
     quanto un dito. Dopo `.current`, se no a parità di peso perde. */
  @media (hover: none) {
    .current { min-height: 36px; }
  }

  .current-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current :global(.ico) { width: 15px; height: 15px; flex: none; color: var(--ink-3); }

  /* il menu sta appeso al corpo della pagina: qui dentro ci sono solo lui e
     il velo che lo chiude */
  .pop {
    position: fixed;
    inset: 0;
    z-index: var(--z-popover);
  }

  /* chiude il menu cliccando ovunque, senza rubare i clic alla mappa sotto */
  .veil {
    position: absolute;
    inset: 0;
  }

  .menu {
    position: absolute;
    max-width: calc(100vw - 16px);
    /* in una finestra bassa non ci sta né sotto né sopra: scorre dentro */
    max-height: calc(100vh - 16px);
    overflow: auto;
    padding: 10px;
    display: grid;
    gap: 6px;
    box-shadow: var(--shadow-3), inset 0 1px 0 var(--highlight);
    animation: rise 0.18s var(--ease);
  }

  .menu ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    max-height: 40vh;
    overflow-y: auto;
  }

  /* la riga è due comandi: aprirla, o solo mostrarla accanto */
  .menu li {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: var(--r-md);
    transition: background 0.14s;
  }

  .menu li:hover { background: var(--sunken); }
  .menu li.is-on { background: var(--sunken-hover); }

  .entry {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    padding: 7px 2px 7px 9px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    font-size: 13px;
    text-align: left;
  }

  .menu li.is-on .entry { font-weight: 560; }

  .eye {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    margin-right: 4px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--ink-3);
    opacity: 0.55;
    transition: opacity 0.14s, background 0.14s, color 0.14s;
  }

  .eye:hover { opacity: 1; background: var(--glass-strong); color: var(--ink); }
  .eye :global(.ico) { width: 15px; height: 15px; }

  /* accesa accanto: l'occhio resta aperto anche senza il puntatore sopra */
  .menu li.is-shown .eye { opacity: 1; color: var(--ink-2); }
  .menu li.is-on .eye { opacity: 0.4; cursor: default; }

  .entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .entry-count {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-3);
  }


  .new {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 7px 9px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--ink-2);
    font-size: 13px;
    transition: background 0.14s, color 0.14s;
  }

  .new:hover { background: var(--sunken); color: var(--ink); }
  .new :global(.ico) { width: 15px; height: 15px; }
</style>
