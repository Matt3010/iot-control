<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';
  import Row from './Row.svelte';

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

<!-- il modulo non disegna niente: tutta la geometria è quella della riga, e i
     pezzi stanno nelle stesse fessure delle righe qui sopra -->
<form class="shell" onsubmit={submit}>
  <Row dashed {id} class={value.trim() ? 'is-ready' : ''}>
    {#snippet lead()}{@render before?.()}{/snippet}

    <input name="name" required maxlength="40" {placeholder} bind:this={field} bind:value />

    {#snippet trail()}
      {@render after?.()}
      <Button look="icon" type="submit" extra="add-go" {title}>
        <Icon name="plus" />
      </Button>
    {/snippet}
  </Row>
</form>

<style>
  .shell { display: contents; }

  :global(.row.is-dashed .add-go) { color: var(--ink-3); }

  :global(.row.is-dashed.is-ready .add-go) {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>