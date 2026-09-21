<script lang="ts">
  import { toast } from '../lib/toast.svelte';
  import Icon from './Icon.svelte';

  /**
   * Un indirizzo pubblico da leggere e da portarsi via. La parte fissa resta
   * smorta; quella che puoi cambiare è un campo, e il tasto copia tutto.
   */
  let {
    prefix,
    value,
    url,
    onchange,
    title = 'Copia il link',
  }: {
    prefix: string;
    value: string;
    url: string;
    /** Se c'è, la parte finale si modifica. */
    onchange?: (value: string) => void;
    title?: string;
  } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1600);
    } catch {
      toast.show('Copia non riuscita: il link è quello che vedi');
    }
  }
</script>

<div class="link-row">
  <span class="link-prefix">{prefix}</span>
  {#if onchange}
    <input
      class="link-slug"
      type="text"
      maxlength="40"
      {value}
      onchange={(event) => onchange(event.currentTarget.value)}
    />
  {:else}
    <span class="link-value">{value}</span>
  {/if}
  <button type="button" class="ghost-icon" {title} onclick={copy}>
    <Icon name={copied ? 'check' : 'link'} />
  </button>
</div>

<style>
  .link-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 2px 2px 8px;
    border-radius: var(--r-sm);
    background: var(--glass-strong);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
    animation: rise 0.2s var(--ease);
  }

  .link-prefix, .link-value {
    font-size: 12px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .link-value {
    flex: 1;
    min-width: 0;
    color: var(--ink);
    font-weight: 540;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-slug {
    flex: 1;
    min-width: 0;
    padding: 5px 4px;
    background: none;
    border-color: transparent;
    font-size: 12px;
  }

  .link-slug:hover, .link-slug:focus { background: var(--sunken); box-shadow: none; }
</style>
