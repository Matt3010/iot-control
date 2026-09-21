<script lang="ts">
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { auth } from '../lib/auth.svelte';
  import { here } from '../lib/here.svelte';
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import Icon from './Icon.svelte';
  import MapSwitcher from './MapSwitcher.svelte';
  import PanelSkeleton from './PanelSkeleton.svelte';
  import PlaceList from './PlaceList.svelte';
  import SearchTrigger from './SearchTrigger.svelte';
  import Button from './Button.svelte';

  /**
   * Su uno schermo stretto il pannello e una sheet non ci stanno insieme:
   * aprendo una sheet il pannello si fa piccolo da solo, e resta come lo
   * lasci se lo apri o lo chiudi a mano.
   */
  /**
   * Oltre una certa soglia i chip diventano un muro: si mostrano i primi e
   * il resto sta dietro a un "+N", che resta aperto se lo apri.
   */
  const CAP = { groups: 6, categories: 8 };
  let allGroups = $state(false);
  let allCategories = $state(false);

  const shownGroups = $derived(allGroups ? store.currentGroups : store.currentGroups.slice(0, CAP.groups));
  const shownCategories = $derived(
    allCategories ? store.categories : store.categories.slice(0, CAP.categories),
  );
  const hiddenGroups = $derived(store.currentGroups.length - shownGroups.length);
  const hiddenCategories = $derived(store.categories.length - shownCategories.length);
  const everythingVisible = $derived(store.hiddenCategories.length === 0);

  const collapsed = $derived(
    viewport.narrow && (ui.panelWish === 'closed' || (ui.panelWish === 'auto' && ui.sheet !== 'none')),
  );

  /** Il modo "vicino a me" vale solo se sappiamo dove sei. */
  const near = $derived(store.listMode === 'near' && !!here.spot);

  /**
   * L'indice: quello che è inquadrato adesso, dal più vicino. Oppure, in
   * strada, i più vicini a te ovunque siano: lì il riquadro non conta.
   */
  const rows = $derived.by(() => {
    mapBridge.view.moves; // re-read whenever the map settles somewhere new
    return store.currentPlaces
      .filter((place) => store.visible(place) && (near || mapBridge.contains(place.lat, place.lng)))
      // in vista si misura dal centro del riquadro, vicino a me da te: così
      // l'origine è sempre quella che si vede sulla mappa
      .map((place) => ({
        place,
        distance: mapBridge.distanceFrom(place.lat, place.lng, near ? here.spot : null),
      }))
      .sort((a, b) => a.distance - b.distance);
  });

  /** Chiedere "vicino a me" senza aver mai detto dove sei attiva la domanda. */
  async function goNear() {
    store.setListMode('near');
    if (here.spot) return;
    // se il permesso non arriva, il modo non può restare acceso a vuoto:
    // sarebbe una preferenza che scatta da sola al prossimo "dove sono"
    if (!(await here.locate())) store.setListMode('view');
  }

  function pickGroup(id: string | null) {
    store.setGroup(id === store.activeGroup ? null : id);
    if (!store.activeGroup) return;
    const points = store.currentPlaces
      .filter(
        (place) =>
          place.groupIds.includes(store.activeGroup!) && !store.hiddenCategories.includes(place.categoryId),
      )
      .map((place) => [place.lat, place.lng] as [number, number]);
    mapBridge.flyToPoints(points);
  }
</script>

<div id="panel" class="surface" class:is-collapsed={collapsed}>
  <div class="panel-head">
    <MapSwitcher />
    <span class="panel-head-end">
      {#if !store.loading}
        <span
          id="place-count"
          class="tally"
          title={store.shownMaps.length > 1
            ? 'Di ' + store.shownMaps.map((map) => map.name).join(' e ')
            : undefined}
        >
          {store.currentPlaces.length}
          {store.currentPlaces.length === 1 ? 'posto' : 'posti'}
        </span>
      {/if}
      <Button
        look="icon"
        extra={'share-btn' + (store.activeMap?.published ? ' is-public' : '')}
        title={store.activeMap?.published
          ? 'Questa mappa è pubblica: copia o cambia il link'
          : 'Pubblica questa mappa e prendi il link'}
        onclick={() => ui.toggleManage('maps')}
      >
        <Icon name="link" />
      </Button>
      <Button
        look="icon"
        extra="leave-btn"
        title={'Esci da ' + (auth.account?.email ?? '')}
        onclick={() => auth.leave()}
      >
        <Icon name="logout" />
      </Button>
      {#if viewport.narrow}
        <Button
          look="icon"
          extra="panel-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? 'Mostra filtri ed elenco' : 'Riduci il pannello'}
          onclick={() => (ui.panelWish = collapsed ? 'open' : 'closed')}
        >
          <Icon name={collapsed ? 'expand' : 'collapse'} />
        </Button>
      {/if}
    </span>
  </div>

  <SearchTrigger />

  {#if !collapsed}
    {#if store.categories.length && !store.loading}
      <div class="panel-row" id="group-head">
        <span class="eyebrow">Gruppi</span>
        <Button
          look="icon"
          id="add-group"
          title="Aggiungi un gruppo"
          onclick={() => ui.toggleManage('groups', 'add')}
        >
          <Icon name="plus" />
        </Button>
      </div>
      <div id="group-filters">
        {#if store.currentGroups.length}
          <Chip
            label="Tutti"
            count={store.currentPlaces.length}
            look={store.activeGroup === null ? 'sel' : 'off'}
            onclick={() => pickGroup(null)}
          />
        {:else}
          <p class="section-hint">Una città, un viaggio, una lista: i gruppi tagliano l'indice per dove stanno i posti.</p>
        {/if}
        {#each shownGroups as group (group.id)}
          <Chip
            label={group.name}
            count={store.countGroup(group.id)}
            look={store.activeGroup === group.id ? 'sel' : 'off'}
            onclick={() => pickGroup(group.id)}
          />
        {/each}
        {#if hiddenGroups > 0}
          <Chip label={'+' + hiddenGroups} look="off" onclick={() => (allGroups = true)} />
        {:else if allGroups && store.currentGroups.length > CAP.groups}
          <Chip label="meno" look="off" onclick={() => (allGroups = false)} />
        {/if}
      </div>
    {/if}

    {#if store.loading}
      <PanelSkeleton />
    {:else}
      {#if store.categories.length}
        <div class="panel-row">
          <span class="eyebrow">Categorie</span>
          <span class="row-actions">
            {#if store.categories.length > 1}
              <Button
                look="link"
                title={everythingVisible
                  ? 'Togli dalla mappa tutte le categorie'
                  : 'Rimetti sulla mappa tutte le categorie'}
                onclick={() =>
                  everythingVisible ? store.hideAllCategories() : store.showAllCategories()}
              >
                <!-- prima diceva "nessuna"/"tutte": sembrava uno stato, invece e' un comando -->
                {everythingVisible ? 'nascondi tutte' : 'mostra tutte'}
              </Button>
            {/if}
            <Button
              look="icon"
              id="add-category"
              title="Aggiungi una categoria"
              onclick={() => ui.toggleManage('categories', 'add')}
            >
              <Icon name="plus" />
            </Button>
          </span>
        </div>

        <div id="filters">
          {#each shownCategories as category (category.id)}
            <Chip
              color={category.color}
              emoji={category.emoji}
              label={category.name}
              count={store.countIn(category.id)}
              look={store.hiddenCategories.includes(category.id) ? 'off' : 'on'}
              onclick={() => store.toggleCategory(category.id)}
            />
          {/each}
          {#if hiddenCategories > 0}
            <Chip label={'+' + hiddenCategories} look="off" onclick={() => (allCategories = true)} />
          {:else if allCategories && store.categories.length > CAP.categories}
            <Chip label="meno" look="off" onclick={() => (allCategories = false)} />
          {/if}
        </div>
      {/if}

      {#if store.currentPlaces.length}
        <div class="panel-row" id="list-head">
          <!-- due modi di leggere lo stesso indice: il riquadro, o le gambe -->
          <div class="modes" role="group" aria-label="Cosa elencare">
            <button
              type="button"
              class="mode"
              class:is-on={!near}
              aria-pressed={!near}
              title="I posti inquadrati adesso"
              onclick={() => store.setListMode('view')}
            >
              In vista
            </button>
            <span class="split" aria-hidden="true"></span>
            <button
              type="button"
              class="mode"
              class:is-on={near}
              aria-pressed={near}
              title={here.spot
                ? 'I tuoi posti più vicini, ovunque siano'
                : 'Chiede al browser dove sei, poi elenca i posti più vicini'}
              onclick={goNear}
            >
              {here.asking ? 'Ti cerco…' : 'Vicino a me'}
            </button>
          </div>
          <span class="list-end">
            <!-- i chilometri partono da qualcosa: qui si dice da cosa, e
                 passandoci sopra quel qualcosa si illumina sulla mappa -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="list-hint"
              hidden={near}
              title="Le distanze partono dal centro della mappa, il cerchietto chiaro"
              onpointerenter={() => document.body.classList.add('centre-hint')}
              onpointerleave={() => document.body.classList.remove('centre-hint')}
            >
              dal centro
            </span>
            <span id="list-count" class="tally">{rows.length}</span>
          </span>
        </div>
        <PlaceList {rows} {near} />
      {:else}
        <EmptyState />
      {/if}
    {/if}
  {/if}
</div>

<style>
/* Panel
   The left rail: wordmark, search, category filters and the index itself —
   the places currently on screen, nearest first. */

/* ------------------------------------------------------------------- panel */

#panel {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: var(--z-panel);
  width: min(326px, calc(100vw - 28px));
  max-height: calc(100vh - 116px);
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  animation: rise 0.5s var(--ease);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 0 6px;
}

/* il conteggio appartiene al titolo, non al mezzo: viaggia col chevron */
.panel-head-end {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

/* i bottoni sono di <Button>: le decorazioni li raggiungono con :global */
.panel-head :global(.panel-toggle) { margin-right: -4px; }

/* uscire è l'unica cosa qui dentro che ti porta fuori: si veste di conseguenza */
.panel-head :global(.leave-btn) { color: color-mix(in srgb, var(--danger) 80%, transparent); }

.panel-head :global(.leave-btn:hover) {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 14%, transparent);
}

/* quando la mappa è pubblica il link si accende: lo stato si vede da lì */
.panel-head :global(.share-btn.is-public) { color: var(--ink); background: var(--sunken-hover); }

.tally {
  font-size: 11.5px;
  font-weight: 560;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  background: var(--sunken);
  border-radius: 99px;
  padding: 2px 9px;
}

.list-end { display: flex; align-items: center; gap: 8px; }

/* la testata appartiene alla lista che sta sotto, non allo spazio sopra */
#list-head { margin-top: 10px; }

/* Non un interruttore appoggiato sopra il pannello, ma la stessa etichetta
   delle altre sezioni che sa stare in due modi: quella accesa è il titolo,
   l'altra è lì pronta. */
.modes {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode {
  padding: 0;
  border: 0;
  background: none;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.085em;
  text-transform: uppercase;
  color: var(--ink-3);
  opacity: 0.55;
  transition: color 0.16s, opacity 0.16s;
}

.mode:hover { opacity: 1; }

.mode.is-on {
  color: var(--ink);
  opacity: 1;
}

.modes .split {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--ink-3);
  opacity: 0.35;
}

.list-hint {
  font-size: 10.5px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink-3);
}

/* le intestazioni stanno sulla colonna di tutto il resto: niente rientro */
.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: -4px;
}

.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.section-hint {
  margin: 0;
  padding: 0 6px 2px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ink-3);
}

/* filters ----------------------------------------------------------------- */

#filters, #group-filters { display: flex; flex-wrap: wrap; gap: 6px; }

@media (max-width: 600px) {
  #panel {
    left: 12px;
    right: 12px;
    top: 12px;
    width: auto;
    max-height: 48vh;
  }
}
</style>
