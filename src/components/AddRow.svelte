<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';

  /**
   * La riga in fondo a ogni lista: si scrive un nome e si aggiunge. Il bordo
   * tratteggiato dice che è un posto vuoto da riempire; quando c'è qualcosa
   * da salvare, il + si accende.
   */
  let {
    id,
    placeholder,
    title,
    value = $bindable(''),
    field = $bindable(),
    onadd,
    before,
    after,
  }: {
    id?: string;
    placeholder: string;
    title: string;
    value: string;
    /** Il campo, per chi deve metterci dentro il cursore. */
    field?: HTMLInputElement;
    onadd: (name: string) => void;
    /** Cosa sta prima e dopo il campo: l'emoji di una categoria, il suo colore. */
    before?: Snippet;
    after?: Snippet;
  } = $props();

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const name = value.trim();
    if (name) onadd(name);
  }
</script>

<form {id} class="add-row" class:is-ready={value.trim()} onsubmit={submit}>
  {@render before?.()}
  <input name="name" required maxlength="40" {placeholder} bind:this={field} bind:value />
  {@render after?.()}
  <Button look="icon" type="submit" extra="add-go" {title}>
    <Icon name="plus" />
  </Button>
</form>

<style>
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

  /* il fuoco lo mostra la riga intera: il campo non deve farne un secondo */
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

  /* il bottone è di <Button>: da qui lo si raggiunge con :global */
  .add-row :global(.add-go) { color: var(--ink-3); }

  .add-row.is-ready :global(.add-go) {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
