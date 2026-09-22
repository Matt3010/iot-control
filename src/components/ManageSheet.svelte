<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { DEFAULT_EMOJI, normalise, SUGGESTED } from '../lib/format';
  import { mapUrl, profileUrl } from '../lib/routing';
  import { fadeEdges } from '../lib/overflow';
  import { store } from '../lib/store.svelte';
  import type { PlaceMap } from '../lib/types';
  import { toast } from '../lib/toast.svelte';
  import { swipeToClose } from '../lib/swipe';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import AddRow from './AddRow.svelte';
  import Icon from './Icon.svelte';
  import LinkRow from './LinkRow.svelte';
  import Row from './Row.svelte';
  import Switch from './Switch.svelte';
  import Tabs from './Tabs.svelte';
  import ShareField from './ShareField.svelte';
  import Button from './Button.svelte';

  /** Una volta sola, perché le domande parlino tutte la stessa lingua. */
  const conta = (n: number): string => (n === 1 ? 'un luogo' : `${n} luoghi`);

  /**
   * Eliminare una mappa porta via i suoi posti, e nient'altro: categorie e
   * gruppi sono tuoi e valgono su tutte. La domanda lo dice per nome, che è
   * l'unico modo perché una conferma serva a qualcosa.
   */
  function portaVia(mapId: string): string | undefined {
    const luoghi = store.places.filter((place) => place.mapId === mapId).length;
    if (!luoghi) return undefined;
    return `Se ne ${luoghi === 1 ? 'va' : 'vanno'} con lei ${conta(luoghi)}. Categorie e gruppi restano.`;
  }

  let newEmoji = $state(DEFAULT_EMOJI);
  let newColor = $state<string>(SUGGESTED[0]!);
  let newCategoryName = $state('');
  let newGroupName = $state('');
  let newMapName = $state('');

  /**
   * Due numeri, due domande: quante volte il link è stato usato, e quanta
   * gente diversa l'ha usato. La frase si costruisce qui perché è la stessa
   * per le mappe e per il profilo, a parte l'ultimo pezzo.
   */
  const many = (count: number, one: string, more: string) =>
    `${count} ${count === 1 ? one : more}`;

  const visitsOfMap = (map: PlaceMap) => {
    if (!map.views && !map.viewers) return 'Ancora nessuna visita.';
    const parts = [many(map.views, 'apertura', 'aperture'), many(map.viewers, 'persona', 'persone')];
    if (map.viewsFromProfile) parts.push(`${map.viewsFromProfile} dal profilo`);
    return parts.join(' · ');
  };

  /**
   * Di chi è l'indirizzo pubblico di quello che si sta guardando. Dentro
   * l'indice di un altro le mappe sono sue, quindi i link sono suoi: mettere
   * il proprio handle davanti alle mappe di qualcun altro darebbe indirizzi
   * che non esistono.
   */
  const handle = $derived(auth.account?.actingAs?.handle ?? auth.account?.handle ?? '');
  /** I conti delle visite sono di chi possiede: in casa d'altri non li abbiamo. */
  const atHome = $derived(!auth.account?.actingAs);

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

  /** Come si conta, detto una volta sola e appeso a ogni numero. */
  const COUNT_NOTE =
    'Le aperture sono quante volte il link è stato usato, senza contare le ricariche ' +
    'dei primi minuti. Le persone sono le impronte diverse in una giornata, e chi ' +
    'torna domani conta di nuovo. Chi sei lo indoviniamo da indirizzo e browser ' +
    'mescolati a un numero che cambia ogni giorno, non lo conserviamo, e dalla ' +
    'stessa rete con lo stesso browser sei sempre la stessa persona, anche in ' +
    'incognito. Le visite fatte mentre sei entrato nel tuo account non contano.';

  /** Oltre una decina di voci scorrerle non basta più: serve poterle cercare. */
  const MANY = 8;
  let categoryFilter = $state('');
  let categoryInput = $state<HTMLInputElement>();
  let groupInput = $state<HTMLInputElement>();

  /** Arrivando dal + il cursore è già nel campo; su telefono no, aprirebbe la tastiera. */
  $effect(() => {
    if (ui.manageIntent !== 'add' || viewport.narrow) return;
    (ui.manageTab === 'groups' ? groupInput : categoryInput)?.focus();
  });
  let groupFilter = $state('');

  const match = (name: string, needle: string) =>
    normalise(name).includes(normalise(needle.trim()));

  const visibleCategories = $derived(
    categoryFilter.trim() ? store.categories.filter((c) => match(c.name, categoryFilter)) : store.categories,
  );
  /** I gruppi sono tuoi: qui ci sono tutti, non solo quelli della mappa aperta. */
  const mapGroups = $derived(store.groups);
  const visibleGroups = $derived(
    groupFilter.trim() ? mapGroups.filter((g) => match(g.name, groupFilter)) : mapGroups,
  );

  async function addCategory(name: string) {
    try {
      const created = await store.createCategory(name, newEmoji, newColor);
      newCategoryName = '';
      newEmoji = DEFAULT_EMOJI;
      // leave the next colour ready instead of offering the same one again
      newColor = SUGGESTED[(SUGGESTED.indexOf(newColor as never) + 1) % SUGGESTED.length]!;
      if (ui.draft) ui.draft.categoryId = created.id;
      toast.show(`Categoria "${created.name}" creata`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function addMap(name: string) {
    try {
      const created = await store.createMap(name);
      newMapName = '';
      toast.show(`"${created.name}" è la mappa selezionata`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function goInto(handle: string) {
    try {
      await auth.goInto(handle);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function addGroup(name: string) {
    try {
      const created = await store.createGroup(name);
      newGroupName = '';
      if (ui.draft) ui.draft.groupIds = [...(ui.draft.groupIds ?? []), created.id];
      toast.show(`Gruppo "${created.name}" creato`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<aside id="manage-sheet" class="surface" use:swipeToClose={() => ui.closeManage()}>
  <header>
    <h2>{ui.manageTab === 'groups' ? 'Gruppi' : 'Categorie'}</h2>
    <Button look="icon" title="Chiudi" onclick={() => ui.closeManage()}>
      <Icon name="close" />
    </Button>
  </header>

  <Tabs
    value={ui.manageTab}
    onpick={(id) => (ui.manageTab = id)}
    options={[
      { id: 'categories', label: 'Categorie' },
      { id: 'groups', label: 'Gruppi' },
    ]}
    label="Cosa stai gestendo"
  />

  {#if ui.manageTab === 'categories'}
    <div class="tab-panel">
      {#if store.categories.length > MANY}
        <input class="list-filter" type="search" placeholder="Cerca categoria" bind:value={categoryFilter} />
      {/if}
      <ul id="category-list" data-fade="none" use:fadeEdges>
        {#each visibleCategories as category (category.id)}
          <li>
            <Row>
              {#snippet lead()}
                <button
                  type="button"
                  class="emoji-btn"
                  title="Cambia emoji"
                  onclick={(event) =>
                    ui.askEmoji(event.currentTarget, (emoji) => store.patchCategory(category, { emoji }))}
                >
                  {category.emoji}
                </button>
              {/snippet}

              <input
                type="text"
                maxlength="40"
                value={category.name}
                onchange={(event) => store.patchCategory(category, { name: event.currentTarget.value })}
              />

              {#snippet trail()}
                <button
                  type="button"
                  class="swatch"
                  title="Cambia colore"
                  style:--c={category.color}
                  aria-label="Colore"
                  onclick={(event) =>
                    ui.askColor(event.currentTarget, category.color, (color) =>
                      store.patchCategory(category, { color }),
                    )}
                ></button>
                <span class="count">{store.countIn(category.id) || ''}</span>
                <Button
                  look="icon"
                  tone="danger"
                  extra="kill"
                  title="Elimina categoria"
                  onclick={(event: MouseEvent) =>
                    ui.askSure(event.currentTarget as HTMLElement, {
                      title: `Eliminare “${category.name}”?`,
                      detail: store.countIn(category.id)
                        ? `Se ne vanno con lei anche ${conta(store.countIn(category.id))}.`
                        : undefined,
                      verb: 'Elimina',
                      onYes: () => store.deleteCategory(category),
                    })}
                >
                  <Icon name="trash" />
                </Button>
              {/snippet}
            </Row>
          </li>
        {/each}
        {#if store.categories.length && !visibleCategories.length}
          <li class="list-empty">Nessuna categoria con questo nome.</li>
        {/if}
      </ul>

      <AddRow
        id="category-form"
        placeholder="Nome categoria"
        title="Crea categoria"
        bind:value={newCategoryName}
        bind:field={categoryInput}
        onadd={addCategory}
      >
        {#snippet before()}
          <button
            type="button"
            class="emoji-btn"
            title="Scegli emoji"
            onclick={(event) => ui.askEmoji(event.currentTarget, (emoji) => (newEmoji = emoji))}
          >
            {newEmoji}
          </button>
        {/snippet}
        {#snippet after()}
          <button
            type="button"
            class="swatch"
            title="Scegli colore"
            style:--c={newColor}
            aria-label="Colore"
            onclick={(event) => ui.askColor(event.currentTarget, newColor, (color) => (newColor = color))}
          ></button>
          <!-- il posto del conteggio resta vuoto, ma resta: così il colore e il
               tasto cadono nella stessa colonna delle righe qui sopra -->
          <span class="count" aria-hidden="true"></span>
        {/snippet}
      </AddRow>
    </div>
  {:else}
    <div class="tab-panel">
      {#if mapGroups.length > MANY}
        <input class="list-filter" type="search" placeholder="Cerca gruppo" bind:value={groupFilter} />
      {/if}
      <ul id="group-list" data-fade="none" use:fadeEdges>
        {#each visibleGroups as group (group.id)}
          <li>
            <Row>
              {#snippet lead()}
                <span class="group-mark" aria-hidden="true"><Icon name="tag" /></span>
              {/snippet}

              <input
                type="text"
                maxlength="40"
                value={group.name}
                onchange={(event) => store.patchGroup(group, { name: event.currentTarget.value })}
              />

              {#snippet trail()}
                <span class="count">{store.countGroup(group.id) || ''}</span>
                <Button
                  look="icon"
                  tone="danger"
                  extra="kill"
                  title="Elimina gruppo"
                  onclick={(event: MouseEvent) =>
                    ui.askSure(event.currentTarget as HTMLElement, {
                      title: `Sciogliere “${group.name}”?`,
                      detail: store.countGroup(group.id)
                        ? `${conta(store.countGroup(group.id))} resta${store.countGroup(group.id) === 1 ? '' : 'no'} dov'è, senza questo gruppo.`
                        : undefined,
                      verb: 'Sciogli',
                      onYes: () => store.deleteGroup(group),
                    })}
                >
                  <Icon name="trash" />
                </Button>
              {/snippet}
            </Row>
          </li>
        {/each}
        {#if mapGroups.length && !visibleGroups.length}
          <li class="list-empty">Nessun gruppo con questo nome.</li>
        {/if}
      </ul>

      <AddRow
        id="group-form"
        placeholder="Nome gruppo — es. Padova"
        title="Crea gruppo"
        bind:value={newGroupName}
        bind:field={groupInput}
        onadd={addGroup}
      />

      <p class="sheet-note">
        Un gruppo tiene insieme i luoghi di una città, di un viaggio, di una lista. Un luogo ne può
        portare quanti ne vuoi, anche da mappe diverse, perché i gruppi sono tuoi come le
        categorie.
      </p>
    </div>
  {/if}
</aside>

<style>
/* emoji button and colour swatch ------------------------------------------ */

.emoji-btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--sunken);
  font-family: var(--emoji);
  font-size: 19px;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s, transform 0.14s var(--ease);
}

.emoji-btn:hover { background: var(--sunken-hover); transform: translateY(-1px); }

/* the colour of a category, as a button that opens the palette */
.swatch {
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--c, var(--ink-3));
  background-image: linear-gradient(160deg, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0) 60%);
  box-shadow: inset 0 0 0 1px rgb(14 17 22 / 0.12), 0 1px 2px rgb(10 13 18 / 0.2);
  transition: transform 0.14s var(--ease), box-shadow 0.18s;
}

.swatch:hover {
  transform: scale(1.08);
  box-shadow: inset 0 0 0 1px rgb(14 17 22 / 0.12), 0 2px 8px rgb(10 13 18 / 0.3);
}

/* the row that adds one more ----------------------------------------------- */

/* la riga è di AddRow: qui si vestono solo i pezzi che ci mettiamo dentro */
:global(.row.is-dashed) .emoji-btn { width: 28px; height: 28px; font-size: 16px; }

:global(.row.is-dashed) .swatch { width: 22px; height: 22px; margin: 0 3px; }

.sheet-note {
  margin: 12px 2px 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--ink-3);
}

/* category manager -------------------------------------------------------- */

#group-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 6px;
}

#group-list:empty { display: none; }

/* la lista scorre dentro di sé: la riga che aggiunge resta sempre sotto gli occhi */
#category-list, #group-list {
  max-height: min(46vh, 340px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

:global(#category-list[data-fade='bottom']), :global(#group-list[data-fade='bottom']) {
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(180deg, #000 calc(100% - 20px), transparent);
}

:global(#category-list[data-fade='top']), :global(#group-list[data-fade='top']) {
  -webkit-mask-image: linear-gradient(0deg, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(0deg, #000 calc(100% - 20px), transparent);
}

:global(#category-list[data-fade='both']), :global(#group-list[data-fade='both']) {
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 20px, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(180deg, transparent, #000 20px, #000 calc(100% - 20px), transparent);
}

.list-filter {
  margin-bottom: 8px;
  font-size: 13px;
}

.list-empty {
  padding: 10px 8px;
  font-size: 12.5px;
  color: var(--ink-3);
}

#category-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 6px;
}

#category-list:empty { display: none; }

/* l'emoji della categoria è il suo ritratto: sta in un bollo come il pin
   della mappa, non in un tasto qualsiasi; nella riga che aggiunge è lo stesso
   bollo, se no la colonna si sposta all'ultima riga */
#category-list .emoji-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: none;
  font-size: 16px;
}

#category-list .emoji-btn:hover { background: var(--glass-strong); transform: none; }

#category-list .swatch { width: 22px; height: 22px; margin: 0 3px; }

/* i gruppi non hanno un'emoji: al suo posto un segno smorto, per il ritmo */
.group-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--ink-3);
}

.group-mark :global(.ico) { width: 15px; height: 15px; }
</style>
