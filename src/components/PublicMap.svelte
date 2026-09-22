<script lang="ts">
  import L, { type Marker } from 'leaflet';
  import { formatDistance } from '../lib/format';
  import { here } from '../lib/here.svelte';
  import { clusterGroup, createMap, DEFAULT_COLOR, meIcon, metersBetween, pinIcon } from '../lib/mapkit';
  import { auth } from '../lib/auth.svelte';
  import { publicApi, type PublicMapPayload, type PublicPlace } from '../lib/publicApi';
  import { toast } from '../lib/toast.svelte';
  import { mapPath, profileUrl } from '../lib/routing';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';

  let { handle, slug }: { handle?: string; slug: string } = $props();

  let data = $state<PublicMapPayload | null>(null);
  let failed = $state('');
  let container = $state<HTMLDivElement>();
  /** Il posto scelto dalla lista: si vede quale, anche dopo il volo. */
  let picked = $state('');

  let live = $state<{ map: L.Map; clusters: L.MarkerClusterGroup; pins: Map<string, Marker> } | null>(
    null,
  );

  /**
   * Chi guarda la mappa di un altro spesso è in quella città: se ci fa sapere
   * dov'è, l'elenco si riordina dal più vicino e dice quanto dista. Senza un
   * "qui", l'unico ordine sensato è alfabetico.
   */
  const distanceTo = (place: { lat: number; lng: number }) =>
    here.spot ? metersBetween([here.spot.lat, here.spot.lng], [place.lat, place.lng]) : 0;

  const sorted = $derived(
    [...(data?.places ?? [])].sort((a, b) =>
      here.spot ? distanceTo(a) - distanceTo(b) : a.name.localeCompare(b.name, 'it'),
    ),
  );

  /** Dalla riga al pin: se sta in un grappolo, prima lo si apre. */
  function reveal(id: string): void {
    picked = id;
    const pin = live?.pins.get(id);
    if (!live || !pin) return;
    live.clusters.zoomToShowLayer(pin, () => {
      live?.map.setView(pin.getLatLng(), Math.max(live.map.getZoom(), 16));
      pin.openPopup();
    });
  }

  const categoryOf = (id: string) => data?.categories.find((category) => category.id === id);

  /* ------------------------------------------------------------- correggere
   * Su certe mappe chi ha il link può anche correggere — una lista che si
   * tiene in due, un indirizzo sbagliato che si sistema mentre lo si scopre.
   * Chi può, e su quale luogo, lo dice il server: qui non si indovina niente,
   * si legge `canEdit`. Se la mappa nomina delle persone, quel campo è vero
   * solo per loro, e solo quando sono entrate.
   */
  let editing = $state<PublicPlace | null>(null);
  /** Sta entrando: il tasto lo dice, se no sembra che non abbia funzionato. */
  let entering = $state(false);

  /**
   * A chi ha le chiavi non si offre di correggere un campo per volta: si offre
   * di entrare. Dentro trova l'indice intero, come lo vede chi ce l'ha.
   */
  async function goIn(): Promise<void> {
    if (!data || entering) return;
    entering = true;
    try {
      await auth.goInto(data.handle);
    } catch (error) {
      entering = false;
      toast.show((error as Error).message);
    }
  }
  /** Se su questa mappa c'è qualcosa che posso correggere: si dice una volta sola. */
  const canFix = $derived((data?.places ?? []).some((place) => place.canEdit));
  let form = $state({ name: '', note: '' });
  let saving = $state(false);
  let problem = $state('');

  function startEdit(place: PublicPlace): void {
    editing = place;
    form = { name: place.name, note: place.note ?? '' };
    problem = '';
  }

  const stopEdit = () => (editing = null);

  async function save(): Promise<void> {
    const place = editing;
    const name = form.name.trim();
    if (!place || !name || saving) return;

    saving = true;
    problem = '';
    try {
      const fixed = await publicApi.edit(place.id, { name, note: form.note.trim() });
      // si scrive dentro allo stesso oggetto: l'elenco e il fumetto guardano
      // lì, e il fumetto aperto non sa rifarsi da solo
      place.name = fixed.name;
      place.note = fixed.note;
      const pin = live?.pins.get(place.id);
      if (pin?.isPopupOpen()) pin.setPopupContent(popupFor(place));
      editing = null;
    } catch (error) {
      problem = (error as Error).message;
    } finally {
      saving = false;
    }
  }

  publicApi
    .map(handle, slug)
    .then((payload) => {
      data = payload;
      // arrivato da un /m/<slug> di prima, o con un pezzo di troppo in fondo:
      // l'indirizzo giusto lo prende ora
      const clean = mapPath(payload.handle, payload.map.slug);
      if (window.location.pathname !== clean) history.replaceState(null, '', clean);
    })
    .catch((error: Error) => (failed = error.message));

  /**
   * Il posto e le indicazioni. Niente eliminazione, e la correzione solo dove
   * quel luogo la permette a chi sta guardando: un tasto che non porta a
   * niente è peggio di un tasto che non c'è.
   */
  function popupFor(place: PublicPlace): HTMLElement {
    const category = categoryOf(place.categoryId);
    const node = document.createElement('div');

    const badge = document.createElement('span');
    badge.className = 'pop-cat';
    badge.style.setProperty('--c', category?.color ?? '#6b7280');
    const emoji = document.createElement('span');
    emoji.className = 'emo';
    emoji.textContent = category?.emoji ?? '📍';
    const label = document.createElement('span');
    label.textContent = category?.name ?? '';
    badge.append(emoji, label);

    const name = document.createElement('h3');
    name.className = 'pop-name';
    name.textContent = place.name;

    const note = document.createElement('p');
    note.className = 'pop-note';
    note.textContent = place.note || '';
    note.hidden = !place.note;

    const actions = document.createElement('div');
    actions.className = 'pop-actions';
    const directions = document.createElement('a');
    directions.target = '_blank';
    directions.rel = 'noreferrer';
    directions.href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    directions.textContent = 'Indicazioni';
    actions.append(directions);

    if (place.canEdit) {
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'pop-fix';
      fix.textContent = 'Correggi';
      fix.onclick = () => startEdit(place);
      actions.append(fix);
    }

    node.append(badge, name, note, actions);
    return node;
  }

  $effect(() => {
    if (!container || !data) return;

    const map = createMap(container, {}, () =>
      here.locate((spot) => map.setView([spot.lat, spot.lng], Math.max(map.getZoom(), 14))),
    );
    const clusters = clusterGroup().addTo(map);

    const markers: Marker[] = [];
    const pins = new Map<string, Marker>();
    for (const place of data.places) {
      const category = categoryOf(place.categoryId);
      const marker = L.marker([place.lat, place.lng], {
        icon: pinIcon({ color: category?.color, emoji: category?.emoji }),
        colour: category?.color ?? DEFAULT_COLOR,
      } as L.MarkerOptions);
      marker.bindPopup(() => popupFor(place), { closeButton: false, offset: [0, 2] });
      marker.on('popupopen', () => (picked = place.id));
      markers.push(marker);
      pins.set(place.id, marker);
      clusters.addLayer(marker);
    }
    map.on('popupclose', () => (picked = ''));
    live = { map, clusters, pins };

    if (markers.length) map.fitBounds(L.latLngBounds(data.places.map((p) => [p.lat, p.lng])), { padding: [60, 60] });
    else map.setView([41.9, 12.5], 5);

    return () => {
      live = null;
      map.remove();
    };
  });

  /** Il puntino di dove sei, con il suo alone: lo stesso dell'app. */
  $effect(() => {
    const map = live?.map;
    const spot = here.spot;
    if (!map || !spot) return;

    const me = L.marker([spot.lat, spot.lng], {
      icon: meIcon(),
      interactive: false,
      zIndexOffset: -500,
    }).addTo(map);
    const halo = L.circle([spot.lat, spot.lng], {
      radius: spot.accuracy,
      className: 'me-halo',
      interactive: false,
    }).addTo(map);

    return () => {
      me.remove();
      halo.remove();
    };
  });

  /** Lo stato del tasto sta sul body, come nell'app. */
  $effect(() => {
    document.body.classList.toggle('finding-me', here.asking);
    document.body.classList.toggle('found-me', !!here.spot);
    return () => document.body.classList.remove('finding-me', 'found-me');
  });
</script>

{#if failed}
  <div class="notice surface">
    <h1>Questa mappa non c'è</h1>
    <p>Forse chi l'ha fatta non l'ha ancora pubblicata, o l'indirizzo è cambiato.</p>
    <Button look="primary" href="/" extra="start">Crea la tua mappa</Button>
  </div>
{:else if data}
  <div id="map" bind:this={container}></div>

  <div class="side">
    <div class="card surface">
      <span class="eyebrow">La mappa di {data.handle}</span>
      <h1>{data.map.name}</h1>
      <p class="count">
        {data.places.length}
        {data.places.length === 1 ? 'luogo' : 'luoghi'}
        {#if data.categories.length}
          · {data.categories.length}
          {data.categories.length === 1 ? 'categoria' : 'categorie'}
        {/if}
      </p>
      {#if data.canManage}
        <!-- le chiavi ce le hai: correggere due campi sarebbe il modo lungo -->
        <button type="button" class="keys" onclick={goIn} disabled={entering}>
          <Icon name="key" />
          {entering ? 'Apro…' : 'Apri e modifica tutto'}
        </button>
      {:else if canFix}
        <!-- dirlo qui: il tasto sta dentro ai fumetti, e un fumetto lo apri
             solo se hai già un motivo per aprirlo -->
        <p class="fixable">
          <Icon name="edit" />
          Puoi correggere nomi e note di questa mappa.
        </p>
      {/if}
      <a class="other" href={profileUrl(data.handle)}>Le altre mappe di {data.handle} →</a>
    </div>

    {#if sorted.length}
      <ul class="list surface">
        {#each sorted as place (place.id)}
          <li>
            <button
              type="button"
              class="row"
              class:is-on={picked === place.id}
              onclick={() => reveal(place.id)}
            >
              <span class="dot" style:--c={categoryOf(place.categoryId)?.color ?? '#6b7280'}>
                {categoryOf(place.categoryId)?.emoji ?? '📍'}
              </span>
              <span class="row-text">
                <span class="row-name">{place.name}</span>
                {#if place.note}<span class="row-note">{place.note}</span>{/if}
              </span>
              {#if here.spot}
                <span class="row-far">{formatDistance(distanceTo(place))}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <Button look="primary" href="/" extra="made">
    <Icon name="pin" /> Fai la tua
  </Button>

  {#if editing}
    <!-- una finestrella, non una scheda laterale: correggere è una cosa sola e
         breve, e la mappa sotto deve restare dov'è -->
    <div
      class="veil"
      role="presentation"
      onclick={stopEdit}
      onkeydown={(event: KeyboardEvent) => event.key === 'Escape' && stopEdit()}
    ></div>
    <div class="fix surface" role="dialog" aria-modal="true" aria-label="Correggi il luogo">
      <span class="eyebrow">Correggi</span>

      <label class="field">
        <span>Nome</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input maxlength="80" autofocus bind:value={form.name} />
      </label>

      <label class="field">
        <span>Note</span>
        <textarea rows="3" maxlength="500" bind:value={form.note}></textarea>
      </label>

      <p class="mind">Quello che scrivi lo vede chiunque apra questa mappa.</p>
      {#if problem}<p class="bad">{problem}</p>{/if}

      <div class="fix-actions">
        <Button size="sm" onclick={stopEdit}>Annulla</Button>
        <Button look="primary" size="sm" disabled={saving || !form.name.trim()} onclick={save}>
          {saving ? 'Salvo…' : 'Salva'}
        </Button>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* chi ha le chiavi entra da qui: è la cosa da fare in questa pagina, per
     lui, quindi ha la forma di un tasto e non di una nota */
  .keys {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    margin-top: 10px;
    padding: 8px 12px;
    border: 0;
    border-radius: var(--r-md);
    background: #b06c0c;
    color: white;
    font: inherit;
    font-size: 12.5px;
    font-weight: 560;
    cursor: pointer;
    transition: filter 0.16s;
  }

  .keys:hover { filter: brightness(1.08); }

  .keys:disabled { opacity: 0.6; cursor: default; }

  .keys :global(.ico) { width: 15px; height: 15px; }

  /* la riga che dice che qui si può correggere: una nota, non un allarme */
  .fixable {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0 0;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--ink-3);
  }

  .fixable :global(.ico) { width: 13px; height: 13px; flex: none; }

  .veil {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    background: color-mix(in srgb, var(--ink) 22%, transparent);
    animation: fade 0.18s var(--ease);
  }

  .fix {
    position: fixed;
    z-index: var(--z-sheet);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(340px, calc(100vw - 28px));
    padding: var(--card-pad);
    display: grid;
    gap: 10px;
    animation: rise 0.22s var(--ease);
  }

  .field { display: grid; gap: 5px; }

  .field span {
    font-size: 10.5px;
    font-weight: 620;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .mind { margin: 0; font-size: 11px; line-height: 1.4; color: var(--ink-3); }

  .bad { margin: 0; font-size: 11.5px; line-height: 1.4; color: var(--danger); }

  .fix-actions { display: flex; justify-content: flex-end; gap: 6px; }

  /* la colonna di sinistra: chi l'ha fatta, e cosa c'è dentro */
  .side {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: var(--z-panel);
    width: min(300px, calc(100vw - 28px));
    max-height: calc(100% - 28px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    animation: rise 0.5s var(--ease);
  }

  .card {
    padding: var(--card-pad);
    display: grid;
    gap: 4px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    display: grid;
    gap: 2px;
    align-content: start;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    text-align: left;
    transition: background 0.14s;
  }

  .row:hover { background: var(--sunken); }
  .row.is-on { background: var(--sunken-hover); }

  /* lo stesso colore del pin sulla mappa: la riga e il puntino sono la stessa cosa */
  .dot {
    display: grid;
    place-items: center;
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent);
    font-size: 13px;
    line-height: 1;
  }

  /* come nell'indice: il testo si prende lo spazio, le distanze si incolonnano */
  .row-text { display: grid; flex: 1; gap: 1px; min-width: 0; }

  .row-name {
    font-size: 13px;
    font-weight: 540;
    letter-spacing: -0.012em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-far {
    flex: none;
    margin-left: auto;
    text-align: right;
    font-size: 11px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .row-note {
    font-size: 11.5px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h1 {
    margin: 0;
    font-size: 19px;
    font-weight: 640;
    letter-spacing: -0.024em;
  }

  .count {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .other {
    margin-top: 6px;
    font-size: 12.5px;
    color: var(--ink-2);
    text-decoration: none;
  }

  .other:hover { color: var(--ink); text-decoration: underline; }

  :global(.made) {
    position: absolute;
    right: 18px;
    bottom: calc(22px + env(safe-area-inset-bottom));
    z-index: var(--z-panel);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 20px;
    border-radius: 99px;
    font-size: 14px;
    text-decoration: none;
    box-shadow: var(--shadow-3), inset 0 1px 0 rgb(255 255 255 / 0.16);
  }

  :global(.made .ico) { width: 16px; height: 16px; }

  .notice {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(360px, calc(100vw - 32px));
    padding: 22px;
    display: grid;
    gap: 8px;
    text-align: center;
  }

  .notice p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.5;
  }

  .notice :global(.start) {
    justify-self: center;
    margin-top: 6px;
  }

  @media (max-width: 600px) {
    /* sotto resta il posto per il tasto: la lista si ferma prima */
    .side { left: 12px; right: 12px; top: 12px; width: auto; max-height: calc(100% - 92px); }
    :global(.made) { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); justify-content: center; }
  }
</style>
