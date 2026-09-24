<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { tasti } from '../lib/fondo.svelte';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { ui, type ModalAction } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import Chip from './Chip.svelte';
  import AgentField from './AgentField.svelte';
  import Tabs from './Tabs.svelte';
  import Button from './Button.svelte';
  import TextField from './TextField.svelte';

  /**
   * Quello che di un luogo si legge e si cambia.
   *
   * Non è una finestra: è quello che una finestra ha dentro. Del guscio —
   * dove sta, quanto è largo, la crocetta, lo spingerla via col dito — non
   * sa niente, e per questo lo stesso pezzo starebbe altrettanto bene dentro
   * a un pannello.
   */

  // Chiudendo la scheda la bozza sparisce un attimo prima di questo
  // componente, quindi ogni lettura deve sopravvivere a quell'attimo.
  const draft = $derived(ui.draft);
  const editing = $derived(Boolean(draft?.id));

  /**
   * Un luogo che si guarda e basta.
   *
   * In casa d'altri si arriva fin dove ti hanno aperto. Sulla mappa grande il
   * tasto «Modifica» già non c'era, ma dal telefono la mappa non c'è: si
   * arriva qui dall'elenco, e la scheda si apriva con i campi pronti e il
   * tasto per eliminare — tutte cose che il server avrebbe rifiutato.
   *
   * La scheda resta, perché vedere un luogo non è toccarlo e dall'elenco non
   * c'è altro modo di leggerne la nota: è che non si scrive niente.
   */
  const mine = $derived(!draft?.id || auth.canTouch(draft.id));

  /**
   * La bozza deve puntare solo a cose che esistono. Vale all'apertura — un
   * luogo nuovo nasce nella prima categoria — e vale dopo, perché la scheda
   * resta aperta mentre vai nell'altra ed elimini proprio quella categoria.
   * Prima se ne accorgeva solo il server, al salvataggio, e diceva di no.
   */
  $effect(() => {
    if (!draft) return;

    // una categoria si porta via i suoi luoghi: se stavi modificando uno di
    // quelli, non c'è più niente da modificare
    if (draft.id && draft.key && !store.places.some((place) => place.key === draft.key)) {
      ui.closePlace();
      return;
    }

    if (draft.mapId && !store.maps.some((map) => map.id === draft.mapId)) {
      ui.closePlace();
      return;
    }

    if (!store.categories.some((category) => category.id === draft.categoryId)) {
      draft.categoryId = store.categories[0]?.id ?? '';
    }

    const held = draft.groupIds ?? [];
    const alive = held.filter((id) => store.groups.some((group) => group.id === id));
    if (alive.length !== held.length) draft.groupIds = alive;
  });

  function save() {
    if (!draft || !mine) return;
    if (!draft.categoryId) {
      toast.show('Scegli una categoria prima di salvare');
      return;
    }

    const name = (draft.name ?? '').trim();
    // dalla linguetta "Agenti" il campo del nome non è in pagina, quindi il
    // browser non può lamentarsi da solo: lo si riporta dove si rimedia
    if (!name) {
      tab = 'edit';
      toast.show('Dai un nome al luogo prima di salvare');
      return;
    }
    store.savePlace({ ...draft, name });
    // Saving something the filters would hide makes it vanish; show it instead.
    if (store.hiddenCategories.includes(draft.categoryId)) store.toggleCategory(draft.categoryId);
    if (store.activeGroup && !(draft.groupIds ?? []).includes(store.activeGroup)) store.setGroup(null);
    ui.closePlace();
    toast.show(editing ? `Luogo «${name}» aggiornato` : `Luogo «${name}» salvato`);
  }

  /** Groups are labels: a place wears as many as you like. */
  function toggleGroup(id: string) {
    if (!draft) return;
    const current = draft.groupIds ?? [];
    draft.groupIds = current.includes(id) ? current.filter((held) => held !== id) : [...current, id];
  }

  function remove() {
    if (!mine) return;
    const place = store.currentPlaces.find((candidate) => candidate.key === draft?.key);
    ui.closePlace();
    if (place) store.deletePlace(place);
  }

  /*
   * I tasti in fondo, che cambiano insieme alla scheda.
   *
   * Non li può sapere chi apre la finestra: «Elimina luogo» esiste solo su
   * un luogo che esiste già, e chi sta guardando la mappa di qualcun altro
   * non ha niente da salvare né da annullare, ha solo da chiudere. Qui si
   * consegna il modo di ricavarli, e il guscio lo richiama ogni volta che
   * qualcosa qui dentro si muove.
   */
  tasti(() => {
    if (!mine) return [{ label: 'Chiudi', look: 'primary', onpick: () => ui.closePlace() }];

    const fondo: ModalAction[] = [];

    if (editing) {
      fondo.push({
        label: 'Elimina luogo',
        look: 'danger',
        icon: 'trash',
        onpick: (anchor) => {
          ui.askSure(anchor, {
            title: `Eliminare “${draft?.name || 'questo luogo'}”?`,
            verb: 'Elimina',
            onYes: remove,
          });
          // la finestra resta dov'è finché non hai risposto
          return false;
        },
      });
    }

    fondo.push({ label: 'Annulla', look: 'ghost', onpick: () => ui.closePlace() });
    // chiudere è mestiere di `save`, che lo fa solo se quello che hai scritto
    // sta in piedi
    fondo.push({ label: 'Salva', look: 'primary', onpick: () => (save(), false) });

    return fondo;
  });

  /** I gruppi sono tuoi e valgono su tutte le mappe: ci sono tutti. */
  const groupsHere = $derived(store.groups);

  /**
   * Due linguette, come nell'altra scheda. Un agente ha bisogno della colonna
   * intera — i suoi interruttori, i suoi cursori, il comando da lanciare — e
   * schiacciato fra i gruppi e le note non ci stava.
   */
  let tab = $state<'edit' | 'agent'>('edit');

</script>

{#if draft}
  <!-- Su quale mappa si sta scrivendo, quando ce n'è più d'una accesa. Il
       titolo della finestra dice cosa stai facendo, non dove. -->
  {#if store.shownMaps.length > 1}
    <p class="head-where">
      in {store.maps.find((m) => m.id === (draft.mapId ?? store.activeMap?.id))?.name}
    </p>
  {/if}

  <!-- Le due linguette dicono «cosa stai modificando», e chi non modifica
       niente non ha niente da scegliere: appendere un agente a un luogo è
       un modo di cambiarlo come un altro. -->
    {#if mine}
      <Tabs
        value={tab}
        onpick={(id) => (tab = id)}
        options={[
          { id: 'edit', label: 'Modifica' },
          { id: 'agent', label: 'Agenti' },
        ]}
        label="Cosa stai modificando"
      />
    {/if}

  <form id="place-form" onsubmit={(event) => (event.preventDefault(), save())}>
      {#if tab === 'edit' || !mine}
      <label class="field">
        <span class="eyebrow">Nome del luogo</span>
        <!-- Il cursore nel nome solo per un luogo nuovo, e solo dove c'è una
             tastiera vera. Su un telefono apriva la tastiera a ogni luogo
             aperto, anche solo per guardarlo, e copriva mezza scheda. -->
        <!-- svelte-ignore a11y_autofocus -->
        <!-- binding a funzione: chiudendo la scheda la bozza sparisce un attimo
             prima del componente, e una lettura secca solleverebbe -->
        <TextField
          name="name"
          required
          maxlength={80}
          placeholder="Es. Trattoria da Nonna"
          autofocus={mine && !draft.id && !viewport.narrow}
          readonly={!mine}
          bind:value={() => draft?.name ?? '', (value: string) => draft && (draft.name = value)}
        />
      </label>

      <div class="field">
        <span class="eyebrow">Categoria</span>
        <div id="category-choice" class="chips">
          {#if store.categories.length === 0}
            <Button look="ghost" onclick={() => ui.openManage('categories', 'add')}>
              Crea la prima categoria
            </Button>
          {:else}
            {#each store.categories as category (category.id)}
              <Chip
                color={category.color}
                emoji={category.emoji}
                label={category.name}
                look={draft.categoryId === category.id ? 'on' : 'off'}
                disabled={!mine}
                onclick={() => (draft.categoryId = category.id)}
              />
            {/each}
{/if}
      </div>
    </div>

    {#if groupsHere.length}
      <div class="field" id="group-field">
        <span class="eyebrow">Gruppi</span>
        <div id="group-choice" class="chips">
          <Chip
            label="Nessun gruppo"
            look={draft.groupIds?.length ? 'off' : 'sel'}
            disabled={!mine}
            onclick={() => (draft.groupIds = [])}
          />
          {#each groupsHere as group (group.id)}
            <Chip
              label={group.name}
              look={draft.groupIds?.includes(group.id) ? 'sel' : 'off'}
              disabled={!mine}
              onclick={() => toggleGroup(group.id)}
            />
          {/each}
        </div>
      </div>
    {/if}

    <label class="field">
      <span class="eyebrow">Note</span>
      <textarea
        name="note"
        maxlength="500"
        rows="3"
        readonly={!mine}
        placeholder={mine ? 'Es. indirizzo, cosa ordinare, con chi ci sei stato' : ''}
        bind:value={() => draft?.note ?? '', (value) => draft && (draft.note = value)}
      ></textarea>
    </label>

    <p id="coords" class="coords">{draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</p>
      {:else}
        <AgentField
          agentIds={draft.agentIds ?? []}
          placeKey={draft.key}
          onchange={(ids) => draft && (draft.agentIds = ids)}
        />
      {/if}

  </form>
{/if}

<style>
/* in quale mappa stai scrivendo, quando non è ovvio */
.head-where {
  font-size: 11.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#place-form { display: grid; gap: 14px; }

</style>
