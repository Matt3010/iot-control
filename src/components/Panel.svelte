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
  import Tabs from './Tabs.svelte';
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

    /*
     * Senza mappa non c'è nessun riquadro da cui scegliere, e nemmeno un
     * centro da cui misurare: sul telefono ci sono tutti, in ordine
     * alfabetico. Diventano «i più vicini» solo quando sai dove sei, che è
     * l'unica origine che resta quando la mappa non c'è.
     */
    const all = store.currentPlaces.filter(
      (place) => store.visible(place) && (near || viewport.narrow || mapBridge.contains(place.lat, place.lng)),
    );

    const misurati = all.map((place) => ({
      place,
      distance: mapBridge.distanceFrom(place.lat, place.lng, near ? here.spot : null),
    }));

    return viewport.narrow && !near
      ? misurati.sort((a, b) => a.place.name.localeCompare(b.place.name, 'it'))
      : misurati.sort((a, b) => a.distance - b.distance);
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
          {store.currentPlaces.length === 1 ? 'luogo' : 'luoghi'}
        </span>
      {/if}
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
        <!-- apre la scheda dei gruppi: lì dentro se ne creano, si rinominano
             e si sciolgono. Un "+" prometteva una cosa sola delle tre. -->
        <Button
          look="icon"
          id="add-group"
          title="Gestisci i gruppi"
          onclick={() => ui.toggleManage('groups', 'add')}
        >
          <Icon name="edit" />
        </Button>
      </div>
      <div id="group-filters">
        {#if store.currentGroups.length}
          <Chip
            label="Tutti i luoghi"
            count={store.currentPlaces.length}
            look={store.activeGroup === null ? 'sel' : 'off'}
            onclick={() => pickGroup(null)}
          />
        {:else}
          <p class="section-hint">I gruppi tengono insieme i luoghi di una città, di un viaggio, di una lista.</p>
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
          <Chip
            label={'Altri ' + hiddenGroups}
            look="off"
            title="Mostra tutti"
            onclick={() => (allGroups = true)}
          />
        {:else if allGroups && store.currentGroups.length > CAP.groups}
          <Chip label="Mostra meno" look="off" onclick={() => (allGroups = false)} />
        {/if}
      </div>
    {/if}

    {#if store.loading}
      <PanelSkeleton />
    {:else}
      {#if store.categories.length}
        <div class="panel-row is-cut">
          <span class="eyebrow">Categorie</span>
          <span class="row-actions">
            {#if store.categories.length > 1}
              <!-- l'occhio dice come stanno adesso le categorie, come nella scheda
                   delle mappe: aperto se sono sulla mappa, chiuso se le hai tolte -->
              <Button
                look="icon"
                extra={'see-all' + (everythingVisible ? '' : ' is-off')}
                title={everythingVisible ? 'Nascondi tutte' : 'Mostra tutte'}
                onclick={() =>
                  everythingVisible ? store.hideAllCategories() : store.showAllCategories()}
              >
                <Icon name={everythingVisible ? 'eye' : 'eyeOff'} />
              </Button>
            {/if}
            <Button
              look="icon"
              id="add-category"
              title="Gestisci le categorie"
              onclick={() => ui.toggleManage('categories', 'add')}
            >
              <Icon name="edit" />
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
            <Chip
              label={'Altre ' + hiddenCategories}
              look="off"
              title="Mostra tutte"
              onclick={() => (allCategories = true)}
            />
          {:else if allCategories && store.categories.length > CAP.categories}
            <Chip label="Mostra meno" look="off" onclick={() => (allCategories = false)} />
          {/if}
        </div>
      {/if}

      {#if store.currentPlaces.length}
        <div class="panel-row is-cut" id="list-head">
          <!-- due modi di leggere lo stesso indice: il riquadro, o le gambe.
               "Vicino a me" non è un interruttore: la prima volta chiede dove
               sei, quindi passa da goNear e non dal solo cambio di modo -->
          <Tabs
            look="text"
            value={near ? 'near' : 'view'}
            onpick={(id) => (id === 'near' ? goNear() : store.setListMode('view'))}
            label="Quali luoghi elencare"
            options={[
              viewport.narrow
                ? { id: 'view', label: 'Tutti', title: 'Tutti i luoghi di questa mappa' }
                : { id: 'view', label: 'In vista', title: 'I luoghi inquadrati adesso' },
              {
                id: 'near',
                label: here.asking ? 'Rilevo la posizione…' : 'Vicino a me',
                title: here.spot ? 'I luoghi più vicini a te' : 'Usa la tua posizione',
              },
            ]}
          />
          <span class="list-end">
            <!-- i chilometri partono da qualcosa: qui si dice da cosa, e
                 passandoci sopra quel qualcosa si illumina sulla mappa -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- «dal centro» è il centro della mappa: dove la mappa non c'è
                 non vuol dire niente, e non si scrive -->
            <span
              class="list-hint"
              hidden={near || viewport.narrow}
              title="Misurate dal centro della mappa"
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

  <!--
    In fondo, chi sei e la porta.
    Stavano tutte e due nel tasto rosso in testa: il nome solo nel suo titolo,
    cioè da nessuna parte su un telefono. Ma «esci» senza sapere da cosa è una
    domanda senza risposta — soprattutto in un'app dove si può stare dentro i
    dati di qualcun altro — e le due cose vanno lette insieme. Qui hanno una
    riga loro, allineata ai bordi del pannello come tutto il resto.
  -->
  {#if auth.account && !collapsed}
    <div class="panel-foot">
      <span class="whoami" title={auth.account.email}>@{auth.account.handle}</span>
      <Button
        look="link"
        tone="danger"
        extra="leave-btn"
        title={'Esci da ' + auth.account.email}
        onclick={() => auth.leave()}
      >
        Esci
      </Button>
    </div>
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

/* quando la mappa è pubblica il link si accende: lo stato si vede da lì */

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

.list-hint {
  font-size: 10.5px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink-3);
}

/* le intestazioni stanno sulla colonna del contenuto delle righe, non su
   quella dei loro sfondi: sopra al pallino e sopra ai chilometri */
.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  margin-bottom: -4px;
}

/* gruppi, categorie ed elenco sono tre cose diverse: un filo lo dice senza
   parlare. Il primo non ce l'ha: sopra di lui c'è già il bordo della ricerca. */
.panel-row.is-cut {
  padding-top: 12px;
  border-top: 1px solid var(--hairline-soft);
}

/* l'occhio segue le categorie: smorto quando le hai tolte tutte */
:global(.see-all) { color: var(--ink-2); }
:global(.see-all.is-off) { color: var(--ink-3); }

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

/* Chi sei: piccolo e smorto, ma scritto per intero. Un nome utente arriva a
   venti caratteri, e «@sca…» non dice con che utente sei entrato.
   Non si chiama «me»: quel nome è già del puntino blu di dove sei, sulla
   mappa, e due cose con lo stesso nome si vestono a vicenda. */
/* la riga in fondo: chi sei a sinistra, la porta a destra, e il filo sopra
   che la stacca dall'elenco come le altre sezioni */
.panel-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 9px;
  border-top: 1px solid var(--hairline-soft);
}

.whoami {
  min-width: 0;
  font-size: 11.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 600px) {
  /* Senza la mappa dietro non c'è niente da lasciar vedere: l'elenco prende
     tutto lo schermo, meno il posto del tasto in fondo. Un pannello alto
     mezzo schermo davanti a uno sfondo vuoto era metà spazio buttato. */
  #panel {
    left: 10px;
    right: 10px;
    top: 10px;
    width: auto;
    max-height: calc(100dvh - 96px - env(safe-area-inset-bottom));
  }

  /* Su uno schermo stretto in testa non ci stanno tutti: il conteggio se ne
     va, perché lo stesso numero è scritto due righe più sotto, accanto a
     «Tutti». Chi sei invece non è scritto da nessun'altra parte. */
  :global(#place-count) { display: none; }
}
</style>
