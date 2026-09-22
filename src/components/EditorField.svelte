<script lang="ts">
  import { toast } from '../lib/toast.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';

  /**
   * Chi può correggere un luogo pubblico.
   *
   * Un elenco vuoto vuol dire chiunque abbia il link, ed è la cosa più
   * probabile: una lista che si tiene in due, un indirizzo passato in chat.
   * Con degli indirizzi dentro, invece, solo quelle persone — e devono essere
   * entrate, perché un link non dice chi sei mentre un accesso sì. È una
   * differenza che cambia tutto, quindi la si sceglie a parole, non deducendola
   * dal fatto che l'elenco sia vuoto.
   */
  let {
    editors = [],
    onchange,
  }: {
    editors?: string[];
    onchange: (emails: string[]) => void;
  } = $props();

  /**
   * L'elenco vuoto non basta a distinguere «chiunque» da «sto per scriverci
   * dentro»: la scelta vive qui finché non ci finisce almeno un indirizzo.
   */
  let restricted = $state(editors.length > 0);
  let fresh = $state('');
  let field = $state<HTMLInputElement | undefined>();

  function everyone() {
    restricted = false;
    fresh = '';
    if (editors.length) onchange([]);
  }

  function few() {
    restricted = true;
    // il campo è l'unica cosa da fare, dopo: ci si mette dentro da solo
    queueMicrotask(() => field?.focus());
  }

  function add() {
    const email = fresh.trim().toLowerCase();
    if (!email) return;
    if (editors.includes(email)) {
      toast.show('Quell’indirizzo c’è già');
      fresh = '';
      return;
    }
    onchange([...editors, email]);
    fresh = '';
  }

  const drop = (email: string) => onchange(editors.filter((held) => held !== email));
</script>

<div class="field">
  <span class="eyebrow">Chi può correggere</span>

  <div class="chips">
    <Chip
      label="Chiunque abbia il link"
      size="sm"
      look={restricted ? 'off' : 'sel'}
      onclick={everyone}
    />
    <Chip label="Solo alcune persone" size="sm" look={restricted ? 'sel' : 'off'} onclick={few} />
  </div>

  {#if restricted}
    <!-- non sono <Chip>: una chip è già un bottone, e la ✕ qui dentro è un
         secondo comando. Stessa forma di quelle degli agenti. -->
    {#if editors.length}
      <div class="chips">
        {#each editors as email (email)}
          <span class="pill">
            <span class="mail">{email}</span>
            <button
              type="button"
              class="drop"
              title="Togli dall’elenco"
              aria-label={`Togli ${email}`}
              onclick={() => drop(email)}
            >
              <Icon name="close" />
            </button>
          </span>
        {/each}
      </div>
    {/if}

    <!-- un modulo dentro il modulo della scheda non si può: il tasto qui è un
         bottone normale e l'invio lo si raccoglie a mano, se no salverebbe il
         luogo invece di aggiungere l'indirizzo -->
    <div class="add">
      <input
        type="email"
        maxlength="120"
        placeholder="nome@esempio.it"
        autocomplete="off"
        bind:this={field}
        bind:value={fresh}
        onkeydown={(event: KeyboardEvent) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          add();
        }}
      />
      <Button
        look="icon"
        extra="add-go"
        title="Aggiungi l’indirizzo"
        disabled={!fresh.trim()}
        onclick={add}
      >
        <Icon name="plus" />
      </Button>
    </div>

    <p class="sub">
      {#if editors.length}
        Devono entrare con quell’indirizzo: un link non dice chi sei, un accesso sì.
      {:else}
        Finché l’elenco è vuoto vale per chiunque abbia il link.
      {/if}
    </p>
  {/if}
</div>

<style>
  .field { display: grid; gap: 8px; min-width: 0; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .sub { margin: 0; font-size: 11px; line-height: 1.4; color: var(--ink-3); }

  /* la forma è quella di una chip spenta, come nell'elenco degli agenti */
  .pill {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    height: 30px;
    padding: 0 4px 0 11px;
    border: 1px solid var(--hairline);
    border-radius: 99px;
    opacity: 0.75;
    transition: opacity 0.16s, border-color 0.16s, transform 0.14s var(--ease);
  }

  .pill:hover, .pill:focus-within { opacity: 1; transform: translateY(-1px); }

  .mail {
    min-width: 0;
    padding-right: 6px;
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* la ✕ sta sempre, smorta: un comando che si scopre solo passandoci sopra
     non si scopre */
  .drop {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--ink-3);
    opacity: 0.5;
    cursor: pointer;
    transition: opacity 0.16s, background 0.16s, color 0.16s;
  }

  .pill:hover .drop, .drop:hover, .drop:focus-visible { opacity: 1; }

  .drop:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }

  .drop :global(.ico) { width: 12px; height: 12px; }

  /* la riga per aggiungerne uno: il tratteggio dice che è un posto da riempire */
  .add {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 3px 3px 4px;
    border: 1px dashed var(--hairline);
    border-radius: var(--r-md);
  }

  .add:focus-within {
    border-style: solid;
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .add input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 0;
    background: none;
    box-shadow: none;
    font-size: 12.5px;
  }

  .add input:hover, .add input:focus { background: none; box-shadow: none; }

  .add :global(.add-go) { color: var(--ink-3); }

  .add:focus-within :global(.add-go:not(:disabled)) {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
