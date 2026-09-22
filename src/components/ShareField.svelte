<script lang="ts">
  import { toast } from '../lib/toast.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Chi può modificare una mappa oltre a chi ce l'ha.
   *
   * Non è «può correggere due campi»: dentro quella mappa fa quello che fai
   * tu. Per questo servono degli indirizzi e non un link: un link non dice chi
   * sei, e questa è una chiave.
   */
  let {
    emails = [],
    onchange,
  }: {
    emails?: string[];
    onchange: (emails: string[]) => void;
  } = $props();

  let fresh = $state('');

  function add() {
    const email = fresh.trim().toLowerCase();
    if (!email) return;
    if (emails.includes(email)) {
      toast.show('Quell’indirizzo c’è già');
      fresh = '';
      return;
    }
    onchange([...emails, email]);
    fresh = '';
  }

  const drop = (email: string) => onchange(emails.filter((held) => held !== email));
</script>

<div class="field">
  <span class="eyebrow">Chi può modificare questa mappa</span>
  <p class="sub">
    Ci entrano e ci lavorano come te: luoghi, categorie, gruppi, agenti. Le tue altre mappe non le
    vedono. Devono entrare con quell’indirizzo — un link non dice chi sei, un accesso sì.
  </p>

  {#if emails.length}
    <!-- non sono <Chip>: una chip è già un bottone, e la ✕ qui dentro è un
         secondo comando. Stessa forma di quelle degli agenti. -->
    <div class="chips">
      {#each emails as email (email)}
        <span class="pill">
          <span class="mail">{email}</span>
          <button
            type="button"
            class="drop"
            title="Togli la chiave"
            aria-label={`Togli la chiave a ${email}`}
            onclick={() => drop(email)}
          >
            <Icon name="close" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <div class="add">
    <input
      type="email"
      maxlength="120"
      placeholder="nome@esempio.it"
      autocomplete="off"
      bind:value={fresh}
      onkeydown={(event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        // dentro una scheda il tasto invio salverebbe altro: qui aggiunge
        event.preventDefault();
        add();
      }}
    />
    <Button
      look="icon"
      extra="add-go"
      title="Dai la chiave"
      disabled={!fresh.trim()}
      onclick={add}
    >
      <Icon name="plus" />
    </Button>
  </div>
</div>

<style>
  .field { display: grid; gap: 8px; min-width: 0; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .sub { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }

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
