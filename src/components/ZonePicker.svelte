<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { fusi, fusoDelBrowser } from '../lib/fuso';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import { perNome, Vista } from '../lib/vista.svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';

  /**
   * Scegliere il fuso orario, da dentro una finestra.
   *
   * Sono più di quattrocento, e in un elenco così si cerca, non si scorre:
   * la ricerca è quella di ogni altro elenco dell'app, la vista, che sa già
   * farlo. Accanto a ogni fuso c'è l'ora che è là adesso, perché è quella che
   * si riconosce — «Europe/Rome» si legge, ma «le 12:04» si vede subito se è
   * la propria.
   */
  interface Fuso {
    id: string;
    name: string;
  }

  const tutti: Fuso[] = fusi().map((id) => ({ id, name: id.replaceAll('_', ' ') }));

  const vista = new Vista<Fuso>({
    chiave: 'fusi',
    criteri: [{ id: 'nome', label: 'Nome', per: perNome }],
    testoDi: (fuso) => fuso.name,
  });

  // quello del browser in cima, se è diverso: è il più probabile
  const qui = fusoDelBrowser();
  const elenco = $derived(vista.applica(tutti));

  const ora = (tz: string): string =>
    new Date().toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit', timeZone: tz });

  async function scegli(tz: string): Promise<void> {
    try {
      await auth.update({ tz });
      ui.closeModal();
      toast.show(`Le scene partono all'ora di ${tz.replaceAll('_', ' ')}`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<!-- svelte-ignore a11y_autofocus -->
<TextField kind="search" placeholder="Cerca una città o una zona" bind:value={vista.cerca} autofocus />

{#if qui !== auth.tz && !vista.cerca.trim()}
  <button type="button" class="fuso is-qui" onclick={() => void scegli(qui)}>
    <span class="nome">{qui.replaceAll('_', ' ')}<em>questo browser</em></span>
    <span class="ora">{ora(qui)}</span>
  </button>
{/if}

<ul class="elenco">
  {#each elenco as fuso (fuso.id)}
    <li>
      <button type="button" class="fuso" class:is-on={fuso.id === auth.tz} onclick={() => void scegli(fuso.id)}>
        <span class="nome">{fuso.name}</span>
        <span class="ora">{ora(fuso.id)}</span>
        {#if fuso.id === auth.tz}<Icon name="check" />{/if}
      </button>
    </li>
  {:else}
    <li class="vuoto">Nessun fuso con questo nome.</li>
  {/each}
</ul>

<style>
  .elenco {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fuso {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink-2);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s;
  }

  .fuso:hover { background: var(--sunken); }

  .fuso.is-on { color: var(--ink); font-weight: 560; }

  .fuso.is-qui { background: var(--sunken); }

  .nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .nome em { margin-left: 8px; font-style: normal; font-size: 11px; color: var(--ink-3); }

  .ora { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--ink-3); }

  .fuso :global(.ico) { width: 15px; height: 15px; color: var(--ok); }

  .vuoto { padding: 12px 10px; font-size: 12px; color: var(--ink-3); }

  @media (hover: none) {
    .fuso { padding: 12px 10px; }
  }
</style>
