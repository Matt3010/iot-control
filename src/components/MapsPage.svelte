<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { mapUrl, profileUrl } from '../lib/routing';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { PlaceMap } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import AddRow from './AddRow.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import LinkRow from './LinkRow.svelte';
  import Row from './Row.svelte';
  import ShareField from './ShareField.svelte';
  import Switch from './Switch.svelte';

  /**
   * La pagina delle mappe.
   *
   * Stava in una linguetta della scheda laterale, insieme a categorie e
   * gruppi. Ma una mappa non è una voce d'elenco come una categoria: ha un
   * indirizzo pubblico, dei conteggi, e sotto ognuna l'elenco di chi la può
   * modificare con le sue regole. In trecento pixel diventava una colonna che
   * scorreva e non si capiva più dove si era.
   */
  let newName = $state('');

  const conta = (count: number) => `${count} ${count === 1 ? 'luogo' : 'luoghi'}`;

  /** Cosa porta via eliminarla: i suoi luoghi. Categorie e gruppi restano. */
  function takesAway(mapId: string): string | undefined {
    const quanti = store.places.filter((place) => place.mapId === mapId).length;
    if (!quanti) return undefined;
    return `Se ne ${quanti === 1 ? 'va' : 'vanno'} con lei ${conta(quanti)}. Categorie e gruppi restano.`;
  }

  const many = (count: number, one: string, more: string) => `${count} ${count === 1 ? one : more}`;

  const visitsOfMap = (map: PlaceMap) => {
    if (!map.views && !map.viewers) return 'Ancora nessuna visita.';
    const parts = [many(map.views, 'apertura', 'aperture'), many(map.viewers, 'persona', 'persone')];
    if (map.viewsFromProfile) parts.push(`${map.viewsFromProfile} dal profilo`);
    return parts.join(' · ');
  };

  const visitsOfProfile = () => {
    const me = auth.account;
    if (!me || (!me.profileViews && !me.profileViewers)) return 'Ancora nessuna visita.';
    const parts = [
      many(me.profileViews, 'apertura', 'aperture'),
      many(me.profileViewers, 'persona', 'persone'),
    ];
    if (me.profileFollowed) {
      parts.push(
        me.profileFollowed === 1
          ? '1 ha aperto una mappa'
          : `${me.profileFollowed} hanno aperto una mappa`,
      );
    }
    return parts.join(' · ');
  };

  const COUNT_NOTE =
    'Le aperture sono quante volte il link è stato usato, senza contare le ricariche ' +
    'dei primi minuti. Le persone sono le impronte diverse in una giornata, e chi ' +
    'torna domani conta di nuovo. Chi sei lo indoviniamo da indirizzo e browser ' +
    'mescolati a un numero che cambia ogni giorno, non lo conserviamo, e dalla ' +
    'stessa rete con lo stesso browser sei sempre la stessa persona, anche in ' +
    'incognito. Le visite fatte mentre sei entrato nel tuo account non contano.';

  /**
   * Di chi è l'indirizzo pubblico di quello che si sta guardando. Dentro le
   * mappe di un altro i link sono suoi: mettere il proprio handle davanti
   * darebbe indirizzi che non esistono.
   */
  const handle = $derived(auth.account?.actingAs?.handle ?? auth.account?.handle ?? '');
  /** I conti delle visite sono di chi possiede: in casa d'altri non li abbiamo. */
  const atHome = $derived(!auth.account?.actingAs);

  /** Le visite arrivano mentre guardi altro: aprendo la pagina si rileggono. */
  $effect(() => {
    void auth.refresh();
  });

  async function create(name: string) {
    try {
      const made = await store.createMap(name);
      newName = '';
      toast.show(`"${made.name}" è la mappa selezionata`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function goInto(who: string) {
    try {
      await auth.goInto(who);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<div class="page">
  <header>
    <a class="back" href="/">
      <Icon name="collapse" />
      Torna alla mappa
    </a>
    <h1>Mappe</h1>
    <p class="lead">
      Ogni mappa tiene i suoi luoghi. Categorie e gruppi invece sono tuoi e valgono su tutte, quindi
      eliminarne una porta via soltanto i luoghi che ci stavano dentro. Quella che pubblichi la vede
      chi ha il link, tranne i luoghi segnati come privati.
    </p>
  </header>

  <div class="grid">
    {#each store.maps as map (map.id)}
      {@const open = map.id === store.activeMap?.id}
      {@const places = store.places.filter((place) => place.mapId === map.id).length}
      {@const url = mapUrl(handle, map.slug)}
      <section class="card">
        <Row active={open} class={map.published ? 'is-public' : ''}>
          {#snippet lead()}
            <button
              type="button"
              class="map-open"
              title={open ? 'Mappa selezionata' : 'Seleziona mappa'}
              aria-pressed={open}
              onclick={() => store.openMap(map.id)}
            >
              <Icon name="pin" />
            </button>
          {/snippet}

          <input
            type="text"
            maxlength="40"
            value={map.name}
            onchange={(event) => store.patchMap(map, { name: event.currentTarget.value })}
          />

          {#snippet trail()}
            <Button
              look="icon"
              extra={'map-eye' + (store.shows(map.id) ? ' is-shown' : '')}
              disabled={open}
              title={open
                ? 'Sempre in vista'
                : store.shows(map.id)
                  ? 'Togli dalla vista'
                  : 'Mostra anche questa'}
              onclick={() => store.toggleShown(map.id)}
            >
              <Icon name={store.shows(map.id) ? 'eye' : 'eyeOff'} />
            </Button>
            <Button
              look="icon"
              tone="danger"
              extra="kill"
              title="Elimina mappa"
              disabled={store.maps.length <= 1}
              onclick={(event: MouseEvent) =>
                ui.askSure(event.currentTarget as HTMLElement, {
                  title: `Eliminare “${map.name}”?`,
                  detail: takesAway(map.id) ?? 'È vuota: non porta via niente.',
                  verb: 'Elimina',
                  onYes: () => store.deleteMap(map),
                })}
            >
              <Icon name="trash" />
            </Button>
          {/snippet}

          {#snippet under()}
            <div class="map-foot">
              <span class="map-meta">
                {places}
                {places === 1 ? 'luogo' : 'luoghi'}{open
                  ? ' · selezionata'
                  : store.shows(map.id)
                    ? ' · in vista'
                    : ''}
              </span>
              <Switch
                checked={map.published}
                onchange={(published) => store.patchMap(map, { published })}
                label={map.published ? 'Mappa pubblica' : 'Mappa privata'}
                title={map.published ? 'Smetti di pubblicarla' : 'Pubblicala'}
                side="end"
              />
            </div>

            {#if map.published}
              <LinkRow
                prefix={'/u/' + handle + '/'}
                value={map.slug}
                {url}
                onchange={(slug) => store.patchMap(map, { slug })}
              />
              <p class="visits" title={COUNT_NOTE}>{visitsOfMap(map)}</p>
            {/if}

            <!-- Le chiavi stanno sotto la mappa che aprono. Un ospite non le
                 passa avanti, quindi da ospite il riquadro non c'è. -->
            {#if atHome}
              <div class="map-keys">
                <ShareField
                  mapId={map.id}
                  editors={map.editors ?? []}
                  onchange={(editors) => store.patchMap(map, { editors })}
                />
              </div>
            {/if}
          {/snippet}
        </Row>
      </section>
    {/each}

    <section class="card is-new">
      <span class="eyebrow">Un'altra mappa</span>
      <AddRow
        id="map-form"
        placeholder="Nome mappa — es. Islanda"
        title="Crea mappa"
        bind:value={newName}
        onadd={create}
      />
    </section>

    {#if store.maps.some((map) => map.published)}
      <section class="card is-new">
        <span class="eyebrow">Link del profilo</span>
        <p class="note">Raccoglie tutte le mappe che hai pubblicato. È l'indirizzo da mettere in bio.</p>
        <LinkRow prefix="/u/" value={handle} url={profileUrl(handle)} title="Copia link" />
        {#if atHome}
          <p class="visits" title={COUNT_NOTE}>{visitsOfProfile()}</p>
        {/if}
      </section>
    {/if}

    {#if auth.account?.actingAs}
      <section class="card is-new">
        <span class="eyebrow">Non sei a casa tua</span>
        <p class="note">
          Stai lavorando nelle mappe di <b>{auth.account.actingAs.handle}</b>: quello che cambi qui
          è suo. Le chiavi delle <i>tue</i> mappe le dai dal tuo.
        </p>
      </section>
    {/if}

    {#if (auth.account?.keys ?? []).length}
      <section class="card is-new">
        <span class="eyebrow">Mappe aperte a te</span>
        <p class="note">Ci entri e ci lavori come se fossero tue. Con la fascia in alto sai sempre dove sei.</p>
        <ul class="theirs">
          {#each auth.account?.keys ?? [] as key (key.mapId)}
            <li>
              <Row active={auth.account?.actingAs?.ownerId === key.ownerId}>
                {#snippet lead()}
                  <span class="keys-mark" aria-hidden="true"><Icon name="key" /></span>
                {/snippet}
                <span class="theirs-name">{key.mapName}<em>di {key.handle}</em></span>
                {#snippet trail()}
                  {#if auth.account?.actingAs?.ownerId === key.ownerId}
                    <span class="here">ci sei</span>
                  {:else}
                    <Button size="sm" onclick={() => void goInto(key.handle)}>Apri</Button>
                  {/if}
                {/snippet}
              </Row>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    overflow: auto;
    padding: 28px 20px 48px;
    background: rgb(var(--base));
  }

  header {
    max-width: 960px;
    margin: 0 auto 22px;
    display: grid;
    gap: 6px;
  }

  .back {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12.5px;
    color: var(--ink-3);
    text-decoration: none;
    transition: color 0.16s;
  }

  .back:hover { color: var(--ink); }

  /* la freccia guarda a sinistra: è un ritorno, non un pannello che si chiude */
  .back :global(.ico) { width: 14px; height: 14px; transform: rotate(-90deg); }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 620;
    letter-spacing: -0.022em;
    color: var(--ink);
  }

  .lead {
    margin: 0;
    max-width: 62ch;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-3);
  }

  /* a colonne, come gli agenti: una mappa condivisa è alta, una privata sono
     tre righe, e in una griglia la riga prende l'altezza della più alta */
  .grid {
    max-width: 960px;
    margin: 0 auto;
    columns: 380px;
    column-gap: 14px;
  }

  .card {
    break-inside: avoid;
    margin-bottom: 14px;
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .card.is-new {
    padding: 14px;
    border-radius: var(--r-md);
    border: 1px dashed var(--hairline);
  }

  .note { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

  .note b { font-weight: 600; color: var(--ink-2); }

  /* il segno a sinistra della riga: il pin della mappa selezionata */
  .map-open {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink-3);
    cursor: pointer;
    transition: color 0.16s, background 0.16s;
  }

  .map-open:hover { background: var(--glass-strong); color: var(--ink-2); }

  :global(.row.is-on) .map-open { color: var(--accent); }

  .map-open :global(.ico) { width: 15px; height: 15px; }

  .card :global(.map-eye) { color: var(--ink-3); }

  .card :global(.map-eye.is-shown) { color: var(--ink); }

  .map-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

  .map-meta { font-size: 11.5px; color: var(--ink-3); }

  /* il conto sta sotto al link, smorzato: è una nota, non un titolo */
  .visits {
    margin: 0;
    padding: 0;
    font-size: 11.5px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  /* le chiavi di una mappa stanno dentro la sua card, staccate da una riga */
  .map-keys {
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--hairline-soft);
  }

  .theirs { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }

  .theirs-name {
    flex: 1;
    min-width: 0;
    padding-left: 4px;
    font-size: 13.5px;
    font-weight: 560;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* di chi è quella mappa: serve, perché due persone la chiamano uguale */
  .theirs-name em {
    font-style: normal;
    font-weight: 460;
    font-size: 11.5px;
    color: var(--ink-3);
  }

  .theirs-name em::before { content: ' '; }

  .keys-mark {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, #b06c0c 16%, transparent);
    color: #b06c0c;
  }

  .keys-mark :global(.ico) { width: 13px; height: 13px; }

  .here { padding: 0 8px; font-size: 11.5px; color: var(--ink-3); }

  /* la riga del nome è un titolo finché non la tocchi, come nelle altre liste */
  .card :global(.link-row) { background: var(--sunken); box-shadow: none; }
</style>
