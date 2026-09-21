<script lang="ts">
  import { publicApi, type PublicProfilePayload } from '../lib/publicApi';
  import { mapPath } from '../lib/routing';
  import Icon from './Icon.svelte';
  import MapBackdrop from './MapBackdrop.svelte';
  import Button from './Button.svelte';

  let { handle }: { handle: string } = $props();

  let data = $state<PublicProfilePayload | null>(null);
  let failed = $state('');

  /** Quanto c'è da vedere in tutto: due numeri bastano a dare la misura. */
  const total = $derived(data ? data.maps.reduce((sum, map) => sum + map.places, 0) : 0);

  publicApi
    .profile(handle)
    .then((payload) => (data = payload))
    .catch((error: Error) => (failed = error.message));
</script>

<div class="gate">
  <MapBackdrop />

  <div class="card surface">
    {#if failed}
      <span class="eyebrow">Place Index</span>
      <h1>Questo profilo non c'è</h1>
      <p class="blurb">L'indirizzo potrebbe essere cambiato, o le mappe non essere più pubbliche.</p>
    {:else if data}
      <header class="head">
        <span class="eyebrow">Le mappe di</span>
        <h1>{data.handle}</h1>
        {#if data.maps.length}
          <p class="tally">
            {data.maps.length}
            {data.maps.length === 1 ? 'mappa' : 'mappe'} · {total}
            {total === 1 ? 'posto' : 'posti'}
          </p>
        {/if}
      </header>

      {#if data.maps.length}
        <ul>
          {#each data.maps as map (map.id)}
            <li>
              <a href={mapPath(data.handle, map.slug)}>
                <!-- le prime categorie che ci stanno dentro: si capisce al volo -->
                <span class="taste" aria-hidden="true">
                  {#each map.emojis as emoji, at (emoji)}
                    <span class="taste-one" style:--at={at}>{emoji}</span>
                  {/each}
                </span>
                <span class="row-text">
                  <span class="name">{map.name}</span>
                  <span class="count">{map.places} {map.places === 1 ? 'posto' : 'posti'}</span>
                </span>
                <Icon name="submit" />
              </a>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="blurb">Non ha ancora pubblicato nessuna mappa.</p>
      {/if}
    {:else}
      <div class="wait" aria-hidden="true">
        <span class="wait-line"></span>
        <span class="wait-row"></span>
        <span class="wait-row"></span>
      </div>
    {/if}

    <footer class="foot">
      <span>Anche tu hai dei posti da tenere insieme?</span>
      <Button look="primary" href="/">Fai la tua</Button>
    </footer>
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
    gap: 16px;
    animation: rise 0.45s var(--ease);
  }

  .head { display: grid; gap: 2px; }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 640;
    letter-spacing: -0.03em;
  }

  .tally {
    margin: 2px 0 0;
    font-size: 12.5px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .blurb { margin: 0; font-size: 13px; color: var(--ink-3); }

  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }

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

  .row-text { flex: 1; min-width: 0; display: grid; gap: 1px; }

  .name {
    font-size: 14px;
    font-weight: 560;
    letter-spacing: -0.014em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count { font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  li :global(.ico) { width: 16px; height: 16px; color: var(--ink-3); flex: none; }

  /* le emoji si sovrappongono un po', come un mazzo di carte in mano */
  .taste {
    display: flex;
    flex: none;
    padding-left: 2px;
  }

  .taste-one {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-left: -8px;
    border-radius: 50%;
    background: var(--glass-strong);
    box-shadow: inset 0 0 0 1px var(--hairline);
    font-family: var(--emoji);
    font-size: 14px;
    z-index: calc(4 - var(--at));
  }

  .taste-one:first-child { margin-left: 0; }

  /* l'attesa ha la forma della pagina che sta arrivando */
  .wait { display: grid; gap: 6px; }

  .wait-line, .wait-row {
    border-radius: var(--r-md);
    background: var(--sunken);
    animation: wait-breathe 1.6s var(--ease) infinite;
  }

  .wait-line { width: 60%; height: 18px; margin-bottom: 6px; }
  .wait-row { height: 52px; }
  .wait-row:last-child { animation-delay: 0.2s; opacity: 0.7; }

  @keyframes wait-breathe {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  /* l'invito sta in fondo, dietro una riga: non ruba la scena alle mappe */
  .foot {
    display: grid;
    justify-items: start;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--hairline-soft);
    font-size: 12.5px;
    color: var(--ink-3);
  }

</style>
