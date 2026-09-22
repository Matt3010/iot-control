<script lang="ts" generics="T extends string">
  /**
   * Le linguette dell'app. Erano scritte tre volte — la scheda di gestione,
   * quella di un luogo, e i due modi dell'indice — e tre copie della stessa
   * cosa ricominciano a divergere di un pixel per volta. Chi le usa passa
   * delle voci, non delle classi.
   *
   * Due vestiti, come per `Button`:
   *
   * - `pill`: la pastiglia, per scegliere cosa riempie una scheda intera
   * - `text`: due parole in maiuscoletto separate da un punto. Quella accesa
   *   fa da titolo della sezione, l'altra sta lì pronta — nel pannello è
   *   l'intestazione stessa, e una pastiglia lì peserebbe troppo
   */
  type Look = 'pill' | 'text';

  let {
    value,
    options,
    onpick,
    label = 'Sezioni',
    look = 'pill',
  }: {
    value: T;
    options: { id: T; label: string; title?: string }[];
    onpick: (id: T) => void;
    /** Come si chiama questo gruppo di linguette, per chi non lo vede. */
    label?: string;
    look?: Look;
  } = $props();
</script>

<div class="tabs {look}" role="tablist" aria-label={label}>
  {#each options as option, at (option.id)}
    {#if look === 'text' && at > 0}<span class="split" aria-hidden="true"></span>{/if}
    <button
      class="tab"
      class:is-on={value === option.id}
      type="button"
      role="tab"
      aria-selected={value === option.id}
      title={option.title}
      onclick={() => onpick(option.id)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .tabs { display: flex; align-items: center; }

  .tab {
    border: 0;
    background: none;
    transition: background 0.16s, color 0.16s, box-shadow 0.16s, opacity 0.16s;
  }

  /* la pastiglia ---------------------------------------------------------- */

  .tabs.pill {
    gap: 2px;
    padding: 3px;
    margin-bottom: 12px;
    border-radius: 99px;
    background: var(--sunken);
  }

  .tabs.pill .tab {
    flex: 1 1 50%;
    min-width: 0;
    padding: 7px 9px;
    border-radius: 99px;
    color: var(--ink-3);
    font-size: 12.5px;
    font-weight: 540;
    white-space: nowrap;
  }

  .tabs.pill .tab:hover { color: var(--ink-2); }

  .tabs.pill .tab.is-on {
    background: var(--glass-strong);
    color: var(--ink);
    /* una sfocatura larga uscirebbe dai 3px di bordo e si leggerebbe come
       meno spazio sotto */
    box-shadow: 0 1px 2px rgb(10 13 18 / 0.18);
  }

  /* le due parole --------------------------------------------------------- */

  .tabs.text { gap: 8px; }

  .tabs.text .tab {
    padding: 0;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.085em;
    text-transform: uppercase;
    color: var(--ink-3);
    opacity: 0.55;
  }

  .tabs.text .tab:hover { opacity: 1; }

  .tabs.text .tab.is-on { color: var(--ink); opacity: 1; }

  .tabs.text .split {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--ink-3);
    opacity: 0.35;
  }
</style>
