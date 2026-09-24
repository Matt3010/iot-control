<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { DEFAULT_MARK, SUGGESTED } from '../lib/format';
  import { fadeEdges } from '../lib/overflow';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import { vistaCategorie, vistaGruppi } from '../lib/viste.svelte';
  import AddRow from './AddRow.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
  import Row from './Row.svelte';
  import Tabs from './Tabs.svelte';
  import Button from './Button.svelte';
  import TextField from './TextField.svelte';
  import ViewControls from './ViewControls.svelte';

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

  let newEmoji = $state(DEFAULT_MARK);
  let newColor = $state<string>(SUGGESTED[0]!);
  let newCategoryName = $state('');
  let newGroupName = $state('');

  /** Categorie ed eliminazioni sono di chi l'indice ce l'ha, non di un ospite. */
  const atHome = $derived(!auth.account?.actingAs);

  /** Oltre una decina di voci scorrerle non basta più: serve poterle cercare. */
  const MANY = 8;
  let categoryInput = $state<HTMLInputElement>();
  let groupInput = $state<HTMLInputElement>();

  /** Arrivando dal + il cursore è già nel campo; su telefono no, aprirebbe la tastiera. */
  $effect(() => {
    if (ui.manageIntent !== 'add' || viewport.narrow) return;
    (ui.manageTab === 'groups' ? groupInput : categoryInput)?.focus();
  });

  /* cercare e mettere in fila lo fa la vista, come in ogni altro elenco */
  const visibleCategories = $derived(vistaCategorie.applica(store.categories));
  /** I gruppi sono tuoi: qui ci sono tutti, non solo quelli della mappa aperta. */
  const mapGroups = $derived(store.groups);
  const visibleGroups = $derived(vistaGruppi.applica(mapGroups));

  async function addCategory(name: string) {
    try {
      const created = await store.createCategory(name, newEmoji, newColor);
      newCategoryName = '';
      newEmoji = DEFAULT_MARK;
      // leave the next colour ready instead of offering the same one again
      newColor = SUGGESTED[(SUGGESTED.indexOf(newColor as never) + 1) % SUGGESTED.length]!;
      if (ui.draft) ui.draft.categoryId = created.id;
      toast.show(`Categoria "${created.name}" creata`);
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

<!--
  Questo non e' una finestra: e' quello che una finestra mostra.

  Del posto dove sta non sa niente — niente bordi, niente titolo, niente
  tasto per chiudere: quelli li mette chi lo ospita. Cosi' la stessa cosa
  puo' stare dentro a una finestra su un telefono e dentro a un pannello su
  uno schermo grande, e a cambiare e' solo la cornice.
-->
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
    <div class="list-tools">
      {#if store.categories.length > MANY}
        <TextField extra="list-filter" kind="search" placeholder="Cerca categoria" bind:value={vistaCategorie.cerca} />
      {/if}
      {#if store.categories.length > 1}
        <ViewControls vista={vistaCategorie} label="In che ordine le categorie" />
      {/if}
    </div>
    <ul id="category-list" data-fade="none" use:fadeEdges>
      {#each visibleCategories as category (category.id)}
        <li>
          <Row>
            {#snippet lead()}
              <button
                type="button"
                class="mark-btn"
                title="Cambia il segno"
                onclick={(event) =>
                  ui.askMark(event.currentTarget, category.emoji, (mark) =>
                    store.patchCategory(category, { emoji: mark }),
                  )}
              >
                <Mark value={category.emoji} size={17} />
              </button>
            {/snippet}

            <TextField
              maxlength={40}
              value={category.name}
              label="Nome della categoria"
              onchange={(nome: string) => store.patchCategory(category, { name: nome })}
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
              <!-- Una categoria vale su tutte le mappe, anche quelle che a
                   un ospite non sono state date: eliminarla è di chi
                   l'indice ce l'ha, e il tasto sta con lui. -->
              {#if atHome}
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
              {/if}
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
          class="mark-btn"
          title="Scegli il segno"
          onclick={(event) => ui.askMark(event.currentTarget, newEmoji, (mark) => (newEmoji = mark))}
        >
          <Mark value={newEmoji} size={17} />
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
    <div class="list-tools">
      {#if mapGroups.length > MANY}
        <TextField extra="list-filter" kind="search" placeholder="Cerca gruppo" bind:value={vistaGruppi.cerca} />
      {/if}
      {#if mapGroups.length > 1}
        <ViewControls vista={vistaGruppi} label="In che ordine i gruppi" />
      {/if}
    </div>
    <ul id="group-list" data-fade="none" use:fadeEdges>
      {#each visibleGroups as group (group.id)}
        <li>
          <Row>
            {#snippet lead()}
              <span class="group-mark" aria-hidden="true"><Icon name="tag" /></span>
            {/snippet}

            <TextField
              maxlength={40}
              value={group.name}
              label="Nome del gruppo"
              onchange={(nome: string) => store.patchGroup(group, { name: nome })}
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

<style>
/* emoji button and colour swatch ------------------------------------------ */

.mark-btn {
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

.mark-btn:hover { background: var(--sunken-hover); transform: translateY(-1px); }

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
:global(.row.is-dashed) .mark-btn { width: 28px; height: 28px; font-size: 16px; }

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

:global(#category-list), :global(#group-list) { --fade: 20px; }

:global(.list-filter) {
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
#category-list .mark-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: none;
  font-size: 16px;
}

#category-list .mark-btn:hover { background: var(--glass-strong); transform: none; }

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

/* Dove si tocca, il segno e il colore di una categoria tornano prendibili.
   Ventotto e ventidue pixel si vedono bene e si mancano col dito, e sono i
   due tasti che in questa scheda si premono di più. In fondo al foglio,
   perché sopra perdeva contro le misure della lista, che hanno lo stesso
   peso e venivano dopo. */
@media (hover: none) {
  :global(#category-list) .mark-btn,
  :global(.row.is-dashed) .mark-btn { width: 40px; height: 40px; font-size: 18px; }

  :global(#category-list) .swatch,
  :global(.row.is-dashed) .swatch { width: 34px; height: 34px; margin: 0; }
}

/* la ricerca prende quello che avanza, l'ordine sta all'altro capo; senza
   ricerca l'ordine resta a destra da solo */
.list-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.list-tools:empty { display: none; }

.list-tools :global(.list-filter) { flex: 1; min-width: 0; }
</style>
