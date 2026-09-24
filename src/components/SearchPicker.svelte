<script lang="ts">
  import type { Snippet } from 'svelte';
  import { perNome, Vista } from '../lib/vista.svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';

  /**
   * Scegliere una voce da un elenco lungo, dentro una finestra.
   *
   * I fusi orari sono più di quattrocento, le marche che si possono collegare
   * quasi mille: in un elenco così si cerca, non si scorre. Era scritto per i
   * fusi, e il catalogo delle marche lo voleva uguale. La ricerca è quella di
   * ogni altro elenco dell'app, la vista.
   */
  interface Voce {
    id: string;
    name: string;
    /** Quello che si legge a destra: l'ora di un fuso. */
    note?: string;
  }

  let {
    voci,
    chiave,
    placeholder,
    vuoto,
    scelta,
    onpick,
    prima,
  }: {
    voci: Voce[];
    /** Dove la vista si ricorda come l'hai lasciata. */
    chiave: string;
    placeholder: string;
    /** Cosa dire quando la ricerca non trova niente. */
    vuoto: string;
    /** La voce di adesso, segnata con la spunta. */
    scelta?: string;
    onpick: (id: string) => void;
    /** Qualcosa da proporre in cima quando non si sta cercando. */
    prima?: Snippet;
  } = $props();

  // svelte-ignore state_referenced_locally
  const vista = new Vista<Voce>({
    chiave,
    criteri: [{ id: 'nome', label: 'Nome', per: perNome }],
    testoDi: (voce) => voce.name,
  });

  const elenco = $derived(vista.applica(voci));
</script>

<!-- svelte-ignore a11y_autofocus -->
<TextField kind="search" {placeholder} bind:value={vista.cerca} autofocus />

{#if prima && !vista.cerca.trim()}{@render prima()}{/if}

<ul class="elenco">
  {#each elenco as voce (voce.id)}
    <li>
      <button type="button" class="voce" class:is-on={voce.id === scelta} onclick={() => onpick(voce.id)}>
        <span class="nome">{voce.name}</span>
        {#if voce.note}<span class="nota">{voce.note}</span>{/if}
        {#if voce.id === scelta}<Icon name="check" />{/if}
      </button>
    </li>
  {:else}
    <li class="vuoto">{vuoto}</li>
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

  /* anche per chi mette qualcosa in cima, così la prima riga è uguale alle altre */
  .voce, :global(.search-picker-voce) {
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

  .voce:hover { background: var(--sunken); }

  .voce.is-on { color: var(--ink); font-weight: 560; }

  .nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .nota { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--ink-3); }

  .voce :global(.ico) { width: 15px; height: 15px; color: var(--ok); }

  .vuoto { padding: 12px 10px; font-size: 12px; color: var(--ink-3); }

  @media (hover: none) {
    .voce, :global(.search-picker-voce) { padding: 12px 10px; }
  }
</style>
