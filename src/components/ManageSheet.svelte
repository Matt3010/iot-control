<script lang="ts">
  import { COLORS, DEFAULT_EMOJI } from '../lib/format';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';

  let newEmoji = $state(DEFAULT_EMOJI);
  let newColor = $state<string>(COLORS[0]);
  let newCategoryName = $state('');
  let newGroupName = $state('');

  async function addCategory(event: SubmitEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const created = await store.createCategory(name, newEmoji, newColor);
      newCategoryName = '';
      newEmoji = DEFAULT_EMOJI;
      // leave the next colour ready instead of offering the same one again
      newColor = COLORS[(COLORS.indexOf(newColor as (typeof COLORS)[number]) + 1) % COLORS.length]!;
      if (ui.draft) ui.draft.categoryId = created.id;
      toast.show(`Categoria "${created.name}" creata`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function addGroup(event: SubmitEvent) {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const created = await store.createGroup(name);
      newGroupName = '';
      if (ui.draft) ui.draft.groupId = created.id;
      toast.show(`Gruppo "${created.name}" creato`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<aside id="manage-sheet" class="surface">
  <header>
    <h2>Categorie e gruppi</h2>
    <button class="ghost-icon" type="button" title="Chiudi" onclick={() => ui.closeManage()}>
      <Icon name="close" />
    </button>
  </header>

  <div class="tabs" role="tablist">
    <button
      class="tab"
      class:is-on={ui.manageTab === 'categories'}
      type="button"
      role="tab"
      onclick={() => (ui.manageTab = 'categories')}
    >
      Categorie
    </button>
    <button
      class="tab"
      class:is-on={ui.manageTab === 'groups'}
      type="button"
      role="tab"
      onclick={() => (ui.manageTab = 'groups')}
    >
      Gruppi
    </button>
  </div>

  {#if ui.manageTab === 'categories'}
    <div class="tab-panel">
      <ul id="category-list">
        {#each store.categories as category (category.id)}
          <li>
            <button
              type="button"
              class="emoji-btn"
              title="Cambia emoji"
              onclick={(event) =>
                ui.askEmoji(event.currentTarget, (emoji) => store.patchCategory(category, { emoji }))}
            >
              {category.emoji}
            </button>
            <input
              type="text"
              maxlength="40"
              value={category.name}
              onchange={(event) => store.patchCategory(category, { name: event.currentTarget.value })}
            />
            <button
              type="button"
              class="swatch"
              title="Colore"
              style:--c={category.color}
              aria-label="Colore"
              onclick={(event) =>
                ui.askColor(event.currentTarget, category.color, (color) =>
                  store.patchCategory(category, { color }),
                )}
            ></button>
            <span class="count">{store.countIn(category.id) || ''}</span>
            <button
              type="button"
              class="ghost-icon"
              title="Elimina categoria"
              onclick={() => store.deleteCategory(category)}
            >
              <Icon name="trash" />
            </button>
          </li>
        {/each}
      </ul>

      <form id="category-form" class="add-row" class:is-ready={newCategoryName.trim()} onsubmit={addCategory}>
        <button
          type="button"
          class="emoji-btn"
          title="Scegli emoji"
          onclick={(event) => ui.askEmoji(event.currentTarget, (emoji) => (newEmoji = emoji))}
        >
          {newEmoji}
        </button>
        <input name="name" required maxlength="40" placeholder="Nuova categoria" bind:value={newCategoryName} />
        <button
          type="button"
          class="swatch"
          title="Colore"
          style:--c={newColor}
          aria-label="Colore"
          onclick={(event) => ui.askColor(event.currentTarget, newColor, (color) => (newColor = color))}
        ></button>
        <button type="submit" class="ghost-icon add-go" title="Aggiungi categoria">
          <Icon name="plus" />
        </button>
      </form>
    </div>
  {:else}
    <div class="tab-panel">
      <ul id="group-list">
        {#each store.groups as group (group.id)}
          <li>
            <input
              type="text"
              maxlength="40"
              value={group.name}
              onchange={(event) => store.patchGroup(group, { name: event.currentTarget.value })}
            />
            <span class="count">{store.countGroup(group.id) || ''}</span>
            <button
              type="button"
              class="ghost-icon"
              title="Elimina gruppo"
              onclick={() => store.deleteGroup(group)}
            >
              <Icon name="trash" />
            </button>
          </li>
        {/each}
      </ul>

      <form id="group-form" class="add-row" class:is-ready={newGroupName.trim()} onsubmit={addGroup}>
        <input name="name" required maxlength="40" placeholder="Nuovo gruppo — Padova, Islanda…" bind:value={newGroupName} />
        <button type="submit" class="ghost-icon add-go" title="Aggiungi gruppo">
          <Icon name="plus" />
        </button>
      </form>

      <p class="sheet-note">
        Un gruppo è dove stanno i posti: una città, un viaggio, una lista. Un posto ne porta uno solo.
      </p>
    </div>
  {/if}
</aside>
