<script lang="ts">
  import { DEFAULT_EMOJI, SUGGESTED } from '../lib/format';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { swipeToClose } from '../lib/swipe';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';

  let newEmoji = $state(DEFAULT_EMOJI);
  let newColor = $state<string>(SUGGESTED[0]!);
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
      newColor = SUGGESTED[(SUGGESTED.indexOf(newColor as never) + 1) % SUGGESTED.length]!;
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
      if (ui.draft) ui.draft.groupIds = [...(ui.draft.groupIds ?? []), created.id];
      toast.show(`Gruppo "${created.name}" creato`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<aside id="manage-sheet" class="surface" use:swipeToClose={() => ui.closeManage()}>
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

/* tabs -------------------------------------------------------------------- */

.tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 12px;
  border-radius: 99px;
  background: var(--sunken);
}

.tab {
  flex: 1 1 50%;
  min-width: 0;
  padding: 7px 12px;
  border: 0;
  border-radius: 99px;
  background: none;
  color: var(--ink-3);
  font-size: 12.5px;
  font-weight: 540;
  transition: background 0.16s, color 0.16s, box-shadow 0.16s;
}

.tab:hover { color: var(--ink-2); }

.tab.is-on {
  background: var(--glass-strong);
  color: var(--ink);
  /* a wide blur would bleed past the 3px gutter and read as less padding below */
  box-shadow: 0 1px 2px rgb(10 13 18 / 0.18);
}

/* the row that adds one more ----------------------------------------------- */

.add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px dashed var(--hairline);
  border-radius: var(--r-md);
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}

.add-row input[name="name"] {
  background: none;
  border-color: transparent;
  padding: 6px 8px;
}

/* the row shows the focus for the whole group; the field must not add a second */
.add-row input[name="name"]:hover,
.add-row input[name="name"]:focus {
  background: none;
  border-color: transparent;
  box-shadow: none;
}

.add-row:focus-within {
  border-style: solid;
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--accent) 10%, transparent);
}

.add-go { color: var(--ink-3); }

.add-row.is-ready .add-go {
  background: var(--accent);
  color: var(--on-accent);
}

.add-row .emoji-btn { width: 32px; height: 32px; font-size: 16px; }

.add-row .swatch { width: 24px; height: 24px; margin: 0 2px; }

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

#group-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: var(--r-md);
  transition: background 0.15s;
}

#group-list li:hover { background: var(--sunken); }

#group-list .count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  white-space: nowrap;
}

#category-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 6px;
}

#category-list:empty { display: none; }

#category-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: var(--r-md);
  transition: background 0.15s;
}

#category-list li:hover { background: var(--sunken); }

/* un campo deve sembrare un campo anche prima che ci passi sopra il mouse */
#category-list input[type="text"], #group-list input {
  background: var(--sunken);
  border-color: transparent;
  padding: 6px 8px;
  font-weight: 500;
}

#category-list li:hover input[type="text"],
#group-list li:hover input { background: var(--sunken-hover); }

#category-list .count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  white-space: nowrap;
}

/* the list is a dense row of controls; the form below is the roomy one */
#category-list .emoji-btn { width: 32px; height: 32px; font-size: 16px; }

#category-list .swatch { width: 24px; height: 24px; margin: 0 2px; }
</style>
