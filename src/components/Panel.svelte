<script lang="ts">
  import { fadeEdges } from '../lib/overflow';
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { auth } from '../lib/auth.svelte';
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import Icon from './Icon.svelte';
  import InstallHint from './InstallHint.svelte';
  import MapSwitcher from './MapSwitcher.svelte';
  import PanelSkeleton from './PanelSkeleton.svelte';
  import PlaceList from './PlaceList.svelte';
  import SearchTrigger from './SearchTrigger.svelte';
  import Button from './Button.svelte';

  /*
   * Gruppi e categorie si vedono tutti, tutti e due, dappertutto.
   *
   * C'era una soglia — sei gruppi, otto categorie — e oltre quella il resto
   * finiva dietro a un «Altre 3» da aprire, con due variabili che si
   * ricordavano se l'avessi aperto. Serviva a non farne un muro quando
   * andavano a capo. Adesso stanno in fila su una riga sola e si scorrono,
   * come sul telefono: non c'è nessun muro da evitare, e niente che si
   * nasconda da solo alla nona categoria.
   */
  const everythingVisible = $derived(store.hiddenCategories.length === 0);

  /**
   * L'indice, e ci sono tutti.
   *
   * Prima si poteva scegliere fra due modi di leggerlo — quello che sta nel
   * riquadro, o i più vicini a te — e nessuno dei due mostrava l'elenco per
   * intero. Un luogo che c'era spariva dalla lista perché la mappa si era
   * spostata di un centimetro, e per ritrovarlo bisognava capire quale dei
   * due modi fosse acceso. L'elenco adesso è l'elenco. Restano fuori solo i
   * luoghi che i filtri qui sopra escludono, che è una scelta di chi guarda.
   *
   * L'ordine sì, quello dipende da cosa c'è sotto. Con la mappa i luoghi si
   * leggono dal più vicino al centro di quello che stai guardando; sul
   * telefono, dove mappa non ce n'è, in ordine alfabetico.
   */
  const rows = $derived.by(() => {
    mapBridge.view.moves; // re-read whenever the map settles somewhere new

    const misurati = store.currentPlaces
      .filter((place) => store.visible(place))
      .map((place) => ({
        place,
        distance: mapBridge.distanceFrom(place.lat, place.lng, null),
      }));

    return viewport.hasMap
      ? misurati.sort((a, b) => a.distance - b.distance)
      : misurati.sort((a, b) => a.place.name.localeCompare(b.place.name, 'it'));
  });

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

<div id="panel" class="surface">
  <div class="panel-head">
    <MapSwitcher />
    <span class="panel-head-end">
      {#if auth.account}
        <!-- Chi sei e la porta, in testa.
             In fondo a un telefono quel posto è del pollice e serve a quello
             che si fa tutti i giorni, quindi il piede se n'era già andato di
             lì. Sul grande stava ancora sotto, e con lui il nome scritto per
             intero, cioè due modi di uscire dalla stessa app, e uno dei due da
             tenere in piedi per niente. Il nome si legge dove serve davvero,
             cioè nella domanda che chiede se uscire. -->
        <Button
          look="icon"
          extra="whoami-btn"
          title={'@' + auth.account.handle + ' — esci'}
          onclick={(event: MouseEvent) =>
            ui.askSure(event.currentTarget as HTMLElement, {
              title: `Uscire da @${auth.account?.handle ?? ''}?`,
              detail: 'Le tue mappe restano dove sono. Si rientra quando vuoi.',
              verb: 'Esci',
              no: 'Resto',
              onYes: () => auth.leave(),
            })}
        >
          <Icon name="handle" />
        </Button>
      {/if}
    </span>
  </div>

  <SearchTrigger />

  <!-- dal browser e non dall'app installata: chi la usa da una scheda non sa
       che su iPhone gli avvisi arrivano solo così -->
  <InstallHint chiudibile />

  {#if store.categories.length && !store.loading}
    <div class="filtro">
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
    <div id="group-filters" class="strisce" data-fade="none" use:fadeEdges>
      {#if store.groups.length}
        <Chip
          label="Tutti i luoghi"
          count={store.currentPlaces.length}
          look={store.activeGroup === null ? 'sel' : 'off'}
          onclick={() => pickGroup(null)}
        />
      {/if}
      {#each store.groups as group (group.id)}
        <Chip
          label={group.name}
          count={store.countGroup(group.id)}
          look={store.activeGroup === group.id ? 'sel' : 'off'}
          onclick={() => pickGroup(group.id)}
        />
      {/each}
    </div>
    </div>
  {/if}

  {#if store.loading}
    <PanelSkeleton />
  {:else}
    {#if store.categories.length}
      <div class="filtro is-cut">
      <div class="panel-row">
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

      <div id="filters" class="strisce" data-fade="none" use:fadeEdges>
        {#each store.categories as category (category.id)}
          <Chip
            color={category.color}
            emoji={category.emoji}
            label={category.name}
            count={store.countIn(category.id)}
            look={store.hiddenCategories.includes(category.id) ? 'off' : 'on'}
            onclick={() => store.toggleCategory(category.id)}
          />
        {/each}
      </div>
      </div>
    {/if}

    {#if store.currentPlaces.length}
      <div class="panel-row is-cut" id="list-head">
        <!-- una testa come quella delle categorie e dei gruppi qui sopra:
             dice cosa si sta leggendo, e quanti ne restano dopo i filtri -->
        <span class="eyebrow">Luoghi</span>
        <span class="list-end">
          <!-- i chilometri partono da qualcosa: qui si dice da cosa, e
               passandoci sopra quel qualcosa si illumina sulla mappa -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- «dal centro» è il centro della mappa: dove la mappa non c'è
               non vuol dire niente, e non si scrive -->
          <span
            class="list-hint"
            hidden={!viewport.hasMap}
            title="Misurate dal centro della mappa"
            onpointerenter={() => document.body.classList.add('centre-hint')}
            onpointerleave={() => document.body.classList.remove('centre-hint')}
          >
            dal centro
          </span>
          <span id="list-count" class="tally">{rows.length}</span>
        </span>
      </div>
      <PlaceList {rows} />
    {:else}
      <EmptyState />
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
  /* Il pannello era piu' stretto di un telefono, e adesso che i filtri
     stanno su una riga sola quella larghezza si legge: l'etichetta con le
     sue due icone prende meta' riga, e delle quattro categorie se ne
     vedevano due. Trentaquattro pixel bastano a farne stare un'altra, e
     sono anche quattro parole in piu' per il nome di un luogo. */
  width: min(360px, calc(100vw - 28px));
  max-height: calc(100vh - 116px);
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  /* gli stacchi sono quelli del telefono, dove ogni pixel tolto e' una riga
     in piu' di luoghi. Sul grande quei tre pixel non li rimpiangeva nessuno,
     e due misure per la stessa cosa vogliono dire ricordarsene due. */
  gap: 9px;
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
#list-head { margin-top: 4px; }

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
  padding-top: 9px;
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

/* filters ----------------------------------------------------------------- */

/*
 * Etichetta, matita e pastiglie su una riga sola, e le pastiglie scorrono.
 *
 * Nato sul telefono, dove le righe si contano: erano due per sezione,
 * quattro in tutto, e le pagava l'elenco, che è quello per cui la pagina si
 * apre. Ma il pannello è largo trecentoventisei pixel anche sul grande —
 * quattro categorie andavano a capo lo stesso, e dalla nona in poi
 * sparivano dietro a un «Altre 3» da aprire. Una striscia sola non manda
 * niente a capo e non nasconde niente, e il conto di quelle nascoste non
 * serve più a nessuno dei due.
 */
.filtro {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
}

.filtro .panel-row { padding-left: 6px; padding-right: 0; gap: 6px; }

.filtro.is-cut {
  padding-top: 9px;
  border-top: 1px solid var(--hairline-soft);
}

.filtro.is-cut .panel-row { padding-top: 0; border-top: 0; }

.strisce {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  /* la striscia che scorre arriva fino al bordo del pannello, se no sembra
     che finisca lì */
  margin-right: calc(-1 * var(--card-pad));
  padding: 2px var(--card-pad) 2px 0;
  scroll-padding: 0 var(--card-pad);
}

.strisce::-webkit-scrollbar { display: none; }

.strisce :global(.chip) { flex: none; }

/* La striscia ha a destra i quattordici pixel che la staccano dal bordo:
   la sfumatura in fondo li conta, se no sulla pastiglia ne restavano otto,
   e otto non si vedono. Il disegno è quello comune, in base.css. */
.strisce { --fade-end: 36px; }

@media (max-width: 600px) {
  /* Su un telefono il pannello e' l'applicazione, non una card appoggiata
     sulla mappa: arriva ai bordi, perche' dietro non c'e' niente da lasciar
     vedere. E' l'unica cosa che qui sotto e' diversa. */
  #panel {
    inset: 0;
    width: auto;
    padding-top: calc(var(--card-pad) + env(safe-area-inset-top));
    /* sotto passa il tasto che aggiunge un luogo, e l'ultima riga
       dell'elenco non gli va a finire dietro */
    padding-bottom: var(--sopra-al-tasto);
    border: 0;
    border-radius: 0;
    max-height: none;
  }
}
</style>
