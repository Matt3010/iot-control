<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { swipeToClose } from '../lib/swipe';
  import { ui } from '../lib/ui.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';

  // Closing the sheet clears the draft a beat before this component goes away,
  // so every read of it has to survive the gap.
  const draft = $derived(ui.draft);
  const editing = $derived(Boolean(draft?.id));

  // A new place starts in the first category and in the group you are looking at.
  $effect(() => {
    if (draft && !draft.categoryId && store.categories.length) draft.categoryId = store.categories[0]!.id;
  });

  function save(event: SubmitEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.categoryId) {
      toast.show('Scegli o crea una categoria');
      return;
    }

    const name = (draft.name ?? '').trim();
    store.savePlace({ ...draft, name });
    // Saving something the filters would hide makes it vanish; show it instead.
    if (store.hiddenCategories.includes(draft.categoryId)) store.toggleCategory(draft.categoryId);
    if (store.activeGroup && !(draft.groupIds ?? []).includes(store.activeGroup)) store.setGroup(null);
    ui.closePlace();
    toast.show(editing ? `"${name}" aggiornato` : `"${name}" salvato`);
  }

  /** Groups are labels: a place wears as many as you like. */
  function toggleGroup(id: string) {
    if (!draft) return;
    const current = draft.groupIds ?? [];
    draft.groupIds = current.includes(id) ? current.filter((held) => held !== id) : [...current, id];
  }

  function remove() {
    const place = store.currentPlaces.find((candidate) => candidate.key === draft?.key);
    ui.closePlace();
    if (place) store.deletePlace(place);
  }
</script>

{#if draft}
  <aside id="place-sheet" class="surface" use:swipeToClose={() => ui.closePlace()}>
    <header>
      <h2 id="place-title">{editing ? 'Modifica posto' : 'Nuovo posto'}</h2>
      <button class="ghost-icon" type="button" title="Chiudi" onclick={() => ui.closePlace()}>
        <Icon name="close" />
      </button>
    </header>

    <form id="place-form" onsubmit={save}>
      <label class="field">
        <span class="eyebrow">Nome</span>
        <!-- svelte-ignore a11y_autofocus -->
        <!-- binding a funzione: chiudendo la scheda la bozza sparisce un attimo
             prima del componente, e una lettura secca solleverebbe -->
        <input
          name="name"
          required
          maxlength="80"
          placeholder="Trattoria da Nonna"
          autofocus
          bind:value={() => draft?.name ?? '', (value) => draft && (draft.name = value)}
        />
      </label>

      <div class="field">
        <span class="eyebrow">Categoria</span>
        <div id="category-choice" class="chips">
          {#if store.categories.length === 0}
            <button type="button" class="ghost" onclick={() => ui.openManage('categories', 'add')}>
              Crea la prima categoria
            </button>
          {:else}
            {#each store.categories as category (category.id)}
              <Chip
                color={category.color}
                emoji={category.emoji}
                label={category.name}
                look={draft.categoryId === category.id ? 'on' : 'off'}
                onclick={() => (draft.categoryId = category.id)}
              />
            {/each}
{/if}
      </div>
    </div>

    {#if store.currentGroups.length}
      <div class="field" id="group-field">
        <span class="eyebrow">Gruppo</span>
        <div id="group-choice" class="chips">
          <Chip
            label="Nessuno"
            look={draft.groupIds?.length ? 'off' : 'sel'}
            onclick={() => (draft.groupIds = [])}
          />
          {#each store.currentGroups as group (group.id)}
            <Chip
              label={group.name}
              look={draft.groupIds?.includes(group.id) ? 'sel' : 'off'}
              onclick={() => toggleGroup(group.id)}
            />
          {/each}
        </div>
      </div>
    {/if}

    <Switch
      checked={draft.private ?? false}
      onchange={(value) => draft && (draft.private = value)}
      label="Privato"
      note="Resta fuori dalla mappa che pubblichi."
    />

    <label class="field">
      <span class="eyebrow">Note</span>
      <textarea
        name="note"
        maxlength="500"
        rows="3"
        placeholder="Indirizzo, il piatto da non perdere, con chi ci sei stato…"
        bind:value={() => draft?.note ?? '', (value) => draft && (draft.note = value)}
      ></textarea>
    </label>

    <p id="coords" class="coords">{draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</p>

    <div class="actions">
      {#if editing}
        <button type="button" class="danger-link" onclick={remove}>
          <Icon name="trash" /> Elimina
        </button>
      {/if}
      <button type="button" class="ghost" onclick={() => ui.closePlace()}>Annulla</button>
      <button type="submit" class="primary">Salva</button>
    </div>
  </form>
  </aside>
{/if}

<style>
#place-form { display: grid; gap: 14px; }

/* un interruttore, non una casella: la differenza si vede da lontano */
/* the container is drawn here; the chips inside it come from <Chip> */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }

.chips :global(.chip) { cursor: pointer; }

.coords {
  margin: -4px 0 0;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: var(--ink-3);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid var(--hairline-soft);
  margin-top: 2px;
}
</style>
