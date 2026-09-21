<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * L'unico bottone dell'app. Le varianti stanno qui dentro, non sparse in un
   * foglio globale: chi lo usa sceglie un `look`, non una classe da ricordare.
   *
   * - `primary`: la cosa da fare, una per schermata
   * - `ghost`:   l'alternativa, con il suo contorno
   * - `icon`:    un'icona sola, nelle testate e nelle righe
   * - `link`:    un comando scritto piccolo, in mezzo al testo
   * - `danger`:  quello che porta via qualcosa
   * - `danger-solid`: lo stesso, ma quando è lui la risposta a una domanda
   *
   * `tone="danger"` lo tinge di rosso qualunque forma abbia: il rosso in
   * quest'app vuol dire una cosa sola, «questo porta via qualcosa», e lo dice
   * il componente, non un foglio di stile qui accanto.
   *
   * Con `href` diventa un link che si veste da bottone. `extra` serve a chi lo
   * ospita per decorarlo (la classe finisce sull'elemento, ma va raggiunta con
   * :global perché il markup è di questo componente).
   */
  type Look = 'primary' | 'ghost' | 'icon' | 'link' | 'danger' | 'danger-solid';

  let {
    look = 'ghost',
    tone,
    href,
    disabled = false,
    extra = '',
    children,
    ...rest
  }: {
    look?: Look;
    tone?: 'danger';
    href?: string;
    disabled?: boolean;
    extra?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

{#if href}
  <!--
    Un <a> non sa cosa sia `disabled`: se lo è, gli si toglie l'indirizzo e lo
    si dice all'assistenza vocale. Il resto (niente clic, niente tab) lo fa il
    CSS qui sotto.
  -->
  <a
    href={disabled ? undefined : href}
    aria-disabled={disabled ? 'true' : undefined}
    tabindex={disabled ? -1 : undefined}
    {...rest}
    class="btn {look} {tone === 'danger' ? 'is-danger' : ''} {extra}"
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    {disabled}
    {...rest}
    class="btn {look} {tone === 'danger' ? 'is-danger' : ''} {extra}"
  >
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    font: inherit;
    cursor: pointer;
    text-decoration: none;
  }

  /* i due modi di essere spento: quello vero dei bottoni e quello dei link */
  .btn:disabled, .btn[aria-disabled='true'] {
    cursor: default;
    pointer-events: none;
  }

  /* ------------------------------------------------------------- primary -- */
  .primary {
    border: 0;
    border-radius: var(--r-md);
    padding: 10px 18px;
    background: var(--accent-grad);
    color: var(--on-accent);
    font-weight: 560;
    letter-spacing: -0.008em;
    box-shadow: var(--shadow-1), inset 0 1px 0 rgb(255 255 255 / 0.14);
    transition: transform 0.14s var(--ease), box-shadow 0.2s, filter 0.2s;
  }

  .primary:hover { filter: brightness(1.08); box-shadow: var(--shadow-2); }
  .primary:active { transform: translateY(1px); }

  /* --------------------------------------------------------------- ghost -- */
  .ghost {
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    padding: 10px 16px;
    background: transparent;
    color: var(--ink-2);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .ghost:hover { background: var(--sunken); color: var(--ink); }

  /* ---------------------------------------------------------------- icon -- */
  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--ink-3);
    transition: background 0.15s, color 0.15s;
  }

  .icon:hover { background: var(--sunken-hover); color: var(--ink); }
  .icon:disabled, .icon[aria-disabled='true'] { opacity: 0.3; }

  /* ---------------------------------------------------------------- link -- */
  .link {
    padding: 3px 8px;
    border: 0;
    border-radius: 99px;
    background: none;
    color: var(--ink-3);
    font-size: 11px;
    font-weight: 560;
    letter-spacing: 0.02em;
    transition: background 0.15s, color 0.15s;
  }

  .link:hover { background: var(--sunken-hover); color: var(--ink); }

  /* -------------------------------------------------------------- danger -- */
  .danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-right: auto;
    padding: 10px 10px 10px 0;
    border: 0;
    background: none;
    color: color-mix(in srgb, var(--danger) 80%, transparent);
    font-size: 13px;
    transition: color 0.15s;
  }

  .danger:hover { color: var(--danger); }
  .danger :global(.ico) { width: 16px; height: 16px; }

  /* ---------------------------------------------------------------- tono -- */
  /* il rosso si vede prima di leggere: chi porta via qualcosa lo porta addosso */
  .is-danger { color: color-mix(in srgb, var(--danger) 80%, transparent); }

  .is-danger:hover {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 14%, transparent);
  }

  /* --------------------------------------------------------- danger-solid -- */
  /* quando la domanda è "lo elimino?", la risposta si prende il colore: è
     l'unica cosa rossa sullo schermo, e non si preme per sbaglio */
  .danger-solid {
    padding: 7px 14px;
    border: 0;
    border-radius: var(--r-md);
    background: var(--danger);
    color: #fff;
    font-size: 12.5px;
    font-weight: 560;
    letter-spacing: -0.008em;
    box-shadow: var(--shadow-1);
    transition: filter 0.15s, transform 0.14s var(--ease);
  }

  .danger-solid:hover { filter: brightness(1.1); }
  .danger-solid:active { transform: translateY(1px); }
</style>
