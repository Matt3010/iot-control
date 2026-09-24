<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { MapEditor, PlaceMap } from '../lib/types';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import CopyLine from './CopyLine.svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';

  /**
   * Chi può modificare una mappa, fin dove, e i link che fanno entrare.
   *
   * Si entra con un link d'invito e non scrivendo un'email: un'email scritta
   * qui la poteva usare chiunque si iscrivesse con quell'indirizzo, un link
   * lo apre chi l'ha ricevuto, una volta. Le regole stanno sulla persona e
   * non su ogni singolo pin: «questi tre a lui, tutti a lei» si decide in un
   * posto solo invece che entrando in venti schede.
   */
  let { map }: { map: PlaceMap } = $props();

  const editors = $derived(map.editors ?? []);
  const invites = $derived(map.invites ?? []);

  /** Il promemoria del prossimo invito: a chi lo si manda. */
  let label = $state('');
  /** L'ultimo link creato: si vede adesso e poi mai più. */
  let link = $state<string | null>(null);
  let busy = $state(false);
  /** Di chi si stanno guardando le regole: uno per volta. */
  let open = $state<string | null>(null);

  /** I luoghi di questa mappa: sono quelli che si possono spuntare. */
  const places = $derived(store.places.filter((place) => place.mapId === map.id));

  async function create() {
    busy = true;
    try {
      link = await store.invite(map, label.trim());
      label = '';
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      busy = false;
    }
  }

  const rule = (editor: MapEditor, only: string[] | null) =>
    void store.share(map, { restrict: editor.userId, only });

  function toggle(editor: MapEditor, placeId: string) {
    const held = editor.only ?? [];
    rule(editor, held.includes(placeId) ? held.filter((id) => id !== placeId) : [...held, placeId]);
  }

  /** Cosa può toccare, in una riga: è quello che si legge di sfuggita. */
  function reach(editor: MapEditor): string {
    if (!editor.only) return 'tutta la mappa';
    if (!editor.only.length) return 'nessun luogo';
    return editor.only.length === 1 ? 'un luogo' : `${editor.only.length} luoghi`;
  }

  /** Quanto vale ancora un invito, in giorni: la data precisa qui non serve. */
  function scade(expiresAt: string): string {
    const giorni = Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000);
    if (giorni <= 1) return 'scade entro domani';
    return `scade fra ${giorni} giorni`;
  }
</script>

<div class="field">
  <span class="eyebrow">Chi può modificare questa mappa</span>
  <p class="sub">
    Ci lavorano come te su luoghi, categorie e gruppi, e comandano gli agenti dei luoghi che gli
    apri. Le tue altre mappe non le vedono. Si entra con un link d’invito, che vale per una persona
    sola e per sette giorni.
  </p>

  {#each editors as editor (editor.userId)}
    <div class="one" class:is-open={open === editor.userId}>
      <div class="who">
        <button
          type="button"
          class="pick"
          title="Cosa può modificare"
          onclick={() => (open = open === editor.userId ? null : editor.userId)}
        >
          <span class="mail">@{editor.handle}</span>
          <span class="reach">{editor.email} · {reach(editor)}</span>
        </button>
        <button
          type="button"
          class="drop"
          title="Togli l’accesso"
          aria-label={`Togli l’accesso a @${editor.handle}`}
          onclick={() => void store.share(map, { drop: editor.userId })}
        >
          <Icon name="close" />
        </button>
      </div>

      {#if open === editor.userId}
        <div class="rules">
          <div class="chips">
            <Chip
              label="Tutta la mappa"
              size="sm"
              look={editor.only ? 'off' : 'sel'}
              onclick={() => rule(editor, null)}
            />
            <Chip
              label="Solo alcuni luoghi"
              size="sm"
              look={editor.only ? 'sel' : 'off'}
              onclick={() => rule(editor, editor.only ?? [])}
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
                  Con l’elenco vuoto non tocca niente, entra e guarda senza cambiare una riga.
                </p>
              {:else}
                <p class="sub">
                  Gli altri luoghi li vede, ma non li tocca, e non ne aggiunge di nuovi. Degli
                  agenti vede solo quelli dei luoghi spuntati.
                </p>
              {/if}
            {:else}
              <p class="sub">Questa mappa non ha ancora nessun luogo da spuntare.</p>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  {#each invites as invite (invite.id)}
    <div class="one">
      <div class="who is-waiting">
        <span class="pick">
          <span class="mail">{invite.label || 'Invito senza promemoria'}</span>
          <span class="reach">da aprire, {scade(invite.expiresAt)}</span>
        </span>
        <button
          type="button"
          class="drop"
          title="Revoca l’invito"
          aria-label={invite.label ? `Revoca l’invito per ${invite.label}` : 'Revoca l’invito senza promemoria'}
          onclick={() => void store.share(map, { revoke: invite.id })}
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  {/each}

  {#if link}
    <div class="fresh">
      <CopyLine text={link} title="Copia il link" fallita="Copia non riuscita, il link è quello che vedi" />
      <p class="sub">
        Si vede solo adesso, perché qui ne resta un’impronta e non il link. Mandalo a chi deve
        entrare, che lo apre, entra o si iscrive, e si ritrova sulla mappa.
      </p>
    </div>
  {/if}

  <div class="add">
    <TextField
      maxlength={60}
      placeholder="A chi lo mandi (facoltativo)"
      autocomplete="off"
      bind:value={label}
      onkeydown={(event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        // dentro una scheda il tasto invio salverebbe altro: qui crea il link
        event.preventDefault();
        void create();
      }}
    />
    <Button size="sm" extra="add-go" disabled={busy} onclick={() => void create()}>
      <Icon name="link" />Crea un link d’invito
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

  /* un invito da aprire non si preme: non c'è niente da regolare finché
     nessuno è entrato */
  .who.is-waiting { border-style: dashed; }

  .who.is-waiting .pick { cursor: default; }

  .fresh { display: grid; gap: 6px; min-width: 0; }

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
    flex: 0 0 auto;
    max-width: 60%;
    min-width: 0;
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* fin dove arriva, detto di sfuggita: è quello che si cerca scorrendo.
     Quando la riga è stretta cede lui, e il nome resta intero */
  .reach {
    flex: 0 1 auto;
    min-width: 0;
    font-size: 11px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

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

  .add :global(.text-field) {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 0;
    background: none;
    box-shadow: none;
    font-size: 12.5px;
  }

  .add :global(.text-field):hover, .add :global(.text-field):focus { background: none; box-shadow: none; }

  .add :global(.add-go) { flex: none; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
</style>
