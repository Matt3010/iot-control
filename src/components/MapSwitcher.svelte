<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let creating = $state(false);
  let newName = $state('');
  let field = $state<HTMLInputElement>();

  $effect(() => {
    if (creating) field?.focus();
  });

  async function create(event: SubmitEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await store.createMap(name);
      newName = '';
      creating = false;
      open = false;
      toast.show(`"${created.name}" è la mappa aperta`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  function choose(id: string) {
    store.openMap(id);
    open = false;
    ui.closePlace();
  }
</script>

<div class="switcher">
  <button
    class="current"
    type="button"
    aria-expanded={open}
    title="Cambia mappa"
    onclick={() => (open = !open)}
  >
    <Icon name="pin" />
    <span class="current-name">{store.activeMap?.name ?? 'Place Index'}</span>
    <Icon name={open ? 'collapse' : 'expand'} />
  </button>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="veil" onclick={() => (open = false)}></div>
    <div class="menu surface">
      <span class="eyebrow">Le tue mappe</span>
      <ul>
        {#each store.maps as map (map.id)}
          <li>
            <button
              type="button"
              class="entry"
              class:is-on={map.id === store.activeMap?.id}
              onclick={() => choose(map.id)}
            >
              <span class="entry-name">{map.name}</span>
              <span class="entry-count">
                {store.places.filter((place) => place.mapId === map.id).length}
              </span>
            </button>
          </li>
        {/each}
      </ul>

      {#if creating}
        <form class="add-row" onsubmit={create}>
          <input
            maxlength="40"
            placeholder="Nome della mappa"
            bind:this={field}
            bind:value={newName}
          />
          <button type="submit" class="ghost-icon add-go" title="Crea"><Icon name="plus" /></button>
        </form>
      {:else}
        <button type="button" class="new" onclick={() => (creating = true)}>
          <Icon name="plus" /> Nuova mappa
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* il nome della mappa si prende tutto lo spazio che avanza in testata */
  .switcher { position: relative; flex: 1 1 auto; min-width: 0; }

  .current {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    padding: 3px 8px 3px 6px;
    margin-left: -6px;
    border: 0;
    border-radius: 99px;
    background: none;
    font-size: 13.5px;
    font-weight: 620;
    letter-spacing: -0.02em;
    transition: background 0.15s;
  }

  .current:hover { background: var(--sunken-hover); }

  .current-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current :global(.ico) { width: 15px; height: 15px; flex: none; color: var(--ink-3); }

  /* chiude il menu cliccando ovunque, senza rubare i clic alla mappa sotto */
  .veil {
    position: fixed;
    inset: 0;
    z-index: 1;
  }

  .menu {
    position: absolute;
    z-index: 2;
    top: calc(100% + 8px);
    left: -6px;
    width: max(220px, 100%);
    padding: 10px;
    display: grid;
    gap: 6px;
    box-shadow: var(--shadow-3), inset 0 1px 0 var(--highlight);
    animation: rise 0.18s var(--ease);
  }

  .menu ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    max-height: 40vh;
    overflow-y: auto;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 9px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    font-size: 13px;
    text-align: left;
    transition: background 0.14s;
  }

  .entry:hover { background: var(--sunken); }
  .entry.is-on { background: var(--sunken-hover); font-weight: 560; }

  .entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .entry-count {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-3);
  }

  .new {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 7px 9px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--ink-2);
    font-size: 13px;
    transition: background 0.14s, color 0.14s;
  }

  .new:hover { background: var(--sunken); color: var(--ink); }
  .new :global(.ico) { width: 15px; height: 15px; }
</style>
