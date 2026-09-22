<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { MapEditor } from '../lib/types';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';

  /**
   * Chi può modificare una mappa, e fin dove.
   *
   * Le regole stanno qui, sulla persona, e non su ogni singolo pin: «questi
   * tre a lui, tutti a lei» si decide in un posto solo invece che entrando in
   * venti schede — e soprattutto si può dire diverso a persone diverse, che
   * da dentro un pin non si poteva proprio.
   */
  let {
    mapId,
    editors = [],
    onchange,
  }: {
    mapId: string;
    editors?: MapEditor[];
    onchange: (editors: MapEditor[]) => void;
  } = $props();

  let fresh = $state('');
  /** Di chi si stanno guardando le regole: una per volta. */
  let open = $state<string | null>(null);

  /** I luoghi di questa mappa: sono quelli che si possono spuntare. */
  const places = $derived(store.places.filter((place) => place.mapId === mapId));

  function add() {
    const email = fresh.trim().toLowerCase();
    if (!email) return;
    if (editors.some((editor) => editor.email === email)) {
      toast.show('Quell’indirizzo c’è già');
      fresh = '';
      return;
    }
    // si entra con tutta la mappa: è il caso normale, e le eccezioni si
    // scrivono dopo, guardando l'elenco
    onchange([...editors, { email }]);
    fresh = '';
    open = email;
  }

  const drop = (email: string) => onchange(editors.filter((editor) => editor.email !== email));

  /** Cambiare le regole di uno, lasciando gli altri dov'erano. */
  function rule(email: string, only: string[] | undefined) {
    onchange(
      editors.map((editor) =>
        editor.email === email ? (only ? { email, only } : { email }) : editor,
      ),
    );
  }

  function toggle(editor: MapEditor, placeId: string) {
    const held = editor.only ?? [];
    rule(
      editor.email,
      held.includes(placeId) ? held.filter((id) => id !== placeId) : [...held, placeId],
    );
  }

  /** Cosa può toccare, in una riga: è quello che si legge di sfuggita. */
  function reach(editor: MapEditor): string {
    if (!editor.only) return 'tutta la mappa';
    if (!editor.only.length) return 'nessun luogo';
    return editor.only.length === 1 ? 'un luogo' : `${editor.only.length} luoghi`;
  }
</script>

<div class="field">
  <span class="eyebrow">Chi può modificare questa mappa</span>
  <p class="sub">
    Ci entrano e ci lavorano come te: luoghi, categorie, gruppi, agenti. Le tue altre mappe non le
    vedono. Devono entrare con quell’indirizzo — un link non dice chi sei, un accesso sì.
  </p>

  {#each editors as editor (editor.email)}
    <div class="one" class:is-open={open === editor.email}>
      <div class="who">
        <button
          type="button"
          class="pick"
          title="Cosa può modificare"
          onclick={() => (open = open === editor.email ? null : editor.email)}
        >
          <span class="mail">{editor.email}</span>
          <span class="reach">{reach(editor)}</span>
        </button>
        <button
          type="button"
          class="drop"
          title="Togli la chiave"
          aria-label={`Togli la chiave a ${editor.email}`}
          onclick={() => drop(editor.email)}
        >
          <Icon name="close" />
        </button>
      </div>

      {#if open === editor.email}
        <div class="rules">
          <div class="chips">
            <Chip
              label="Tutta la mappa"
              size="sm"
              look={editor.only ? 'off' : 'sel'}
              onclick={() => rule(editor.email, undefined)}
            />
            <Chip
              label="Solo alcuni luoghi"
              size="sm"
              look={editor.only ? 'sel' : 'off'}
              onclick={() => rule(editor.email, editor.only ?? [])}
            />
          </div>

          {#if editor.only}
            {#if places.length}
              <div class="chips">
                {#each places as place (place.id)}
                  <Chip
                    label={place.name}
                    size="sm"
                    look={editor.only.includes(place.id) ? 'sel' : 'off'}
                    onclick={() => toggle(editor, place.id)}
                  />
                {/each}
              </div>
              {#if !editor.only.length}
                <p class="sub">
                  Con l’elenco vuoto non tocca niente: entra, guarda, e non cambia una riga.
                </p>
              {:else}
                <p class="sub">Gli altri luoghi li vede, ma non li tocca. E non ne aggiunge di nuovi.</p>
              {/if}
            {:else}
              <p class="sub">Questa mappa non ha ancora nessun luogo da spuntare.</p>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/each}

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
    <Button look="icon" extra="add-go" title="Dai la chiave" disabled={!fresh.trim()} onclick={add}>
      <Icon name="plus" />
    </Button>
  </div>
</div>

<style>
  .field { display: grid; gap: 8px; min-width: 0; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .sub { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }

  .one { display: grid; gap: 6px; min-width: 0; }

  /* la riga di una persona: si apre premendola, e mentre è aperta si stacca
     dal resto, se no non si capisce di chi sono le regole sotto */
  .who {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    border: 1px solid var(--hairline);
    border-radius: 99px;
    opacity: 0.75;
    transition: opacity 0.16s, border-color 0.16s;
  }

  .who:hover, .who:focus-within { opacity: 1; }

  .one.is-open .who {
    opacity: 1;
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 6px 4px 6px 11px;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .mail {
    min-width: 0;
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* fin dove arriva, detto di sfuggita: è quello che si cerca scorrendo */
  .reach { flex: none; font-size: 11px; color: var(--ink-3); }

  .one.is-open .pick .mail { color: var(--ink); }

  /* la ✕ sta sempre, smorta: un comando che si scopre solo passandoci sopra
     non si scopre */
  .drop {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    margin-right: 4px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--ink-3);
    opacity: 0.5;
    cursor: pointer;
    transition: opacity 0.16s, background 0.16s, color 0.16s;
  }

  .who:hover .drop, .drop:hover, .drop:focus-visible { opacity: 1; }

  .drop:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }

  .drop :global(.ico) { width: 12px; height: 12px; }

  /* le regole di quella persona: rientrate, così si vede che sono sue */
  .rules {
    display: grid;
    gap: 7px;
    margin-left: 10px;
    padding-left: 10px;
    border-left: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }

  /* la riga per darne una nuova: il tratteggio dice che è un posto da riempire */
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
