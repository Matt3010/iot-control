<script lang="ts">
  import { publicApi, type PublicProfilePayload } from '../lib/publicApi';
  import { mapPath } from '../lib/routing';
  import Icon from './Icon.svelte';
  import MapBackdrop from './MapBackdrop.svelte';

  let { handle }: { handle: string } = $props();

  let data = $state<PublicProfilePayload | null>(null);
  let failed = $state('');

  publicApi
    .profile(handle)
    .then((payload) => (data = payload))
    .catch((error: Error) => (failed = error.message));
</script>

<div class="gate">
  <MapBackdrop />

  <div class="card surface">
    {#if failed}
      <h1>Questo profilo non c'è</h1>
      <p class="blurb">L'indirizzo potrebbe essere cambiato.</p>
    {:else if data}
      <span class="eyebrow">Le mappe di</span>
      <h1>{data.handle}</h1>

      {#if data.maps.length}
        <ul>
          {#each data.maps as map (map.id)}
            <li>
              <a href={mapPath(data.handle, map.slug)}>
                <span class="name">{map.name}</span>
                <span class="count">{map.places} {map.places === 1 ? 'posto' : 'posti'}</span>
                <Icon name="submit" />
              </a>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="blurb">Non ha ancora pubblicato nessuna mappa.</p>
      {/if}
    {:else}
      <p class="blurb">Un attimo…</p>
    {/if}

    <a class="primary" href="/">Fai la tua</a>
  </div>
</div>

<style>
  .gate {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    overflow: hidden;
  }

  .gate::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(120% 90% at 50% 40%, rgb(var(--base) / 0.1), rgb(var(--base) / 0.72));
    pointer-events: none;
  }

  .card {
    position: relative;
    z-index: 1;
    width: min(420px, 100%);
    padding: 22px;
    display: grid;
    gap: 10px;
    animation: rise 0.45s var(--ease);
  }

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 640;
    letter-spacing: -0.028em;
  }

  .blurb { margin: 0; font-size: 13px; color: var(--ink-3); }

  ul { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 6px; }

  li a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: var(--sunken);
    color: inherit;
    text-decoration: none;
    transition: background 0.15s, transform 0.14s var(--ease);
  }

  li a:hover { background: var(--sunken-hover); transform: translateY(-1px); }

  .name { flex: 1; min-width: 0; font-size: 14px; font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  li :global(.ico) { width: 16px; height: 16px; color: var(--ink-3); }

  .primary { justify-self: start; margin-top: 6px; text-decoration: none; }
</style>
