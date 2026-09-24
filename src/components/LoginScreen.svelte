<script lang="ts">
  import { untrack } from 'svelte';
  import { auth } from '../lib/auth.svelte';
  import Alert from './Alert.svelte';
  import Icon from './Icon.svelte';
  import Gate from './Gate.svelte';
  import Stop from './Stop.svelte';
  import TextField from './TextField.svelte';
  import Button from './Button.svelte';

  /**
   * Chi arriva da un link d'invito: la porta è la stessa, ma prima di
   * chiedere chi sei dice perché sei qui. Di solito non ha ancora un
   * accesso, e allora si parte dal crearlo.
   */
  let { invito }: { invito?: { mapName: string; ownerHandle: string } } = $props();

  let email = $state('');
  let password = $state('');
  /** La seconda volta serve a scoprire i refusi finché si può ancora. */
  let conferma = $state('');
  /** L'occhiolino vale per tutte e due: se guardi, guardi quello che scrivi. */
  let mostra = $state(false);
  let handle = $state('');
  let error = $state('');
  let working = $state(false);
  /** Chi arriva per primo crea; gli altri entrano, o creano se è permesso. */
  // chi arriva da un invito di solito un accesso non ce l'ha ancora
  let wantsAccount = $state(untrack(() => !!invito) && auth.signupOpen);
  /** Finché non lo tocchi, il nome utente lo proponiamo noi dall'email. */
  let chosen = $state(false);

  const firstRun = $derived(auth.needsSetup);
  const creating = $derived(firstRun || wantsAccount);
  /** Quando l'errore porta già la sua via d'uscita, in fondo non serve ripeterla. */
  const errorLeadsBack = $derived(creating && !firstRun && /email.*registrata/.test(error));

  /** Sta in un indirizzo: minuscolo, senza accenti, senza spazi. */
  const toHandle = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);

  const suggested = $derived(toHandle(email.split('@')[0] ?? ''));
  const chosenHandle = $derived(chosen ? handle : suggested);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    // meglio dirlo qui che dopo un viaggio fino al server
    if (creating && password !== conferma) {
      error = 'Le due password non coincidono';
      conferma = '';
      return;
    }
    error = '';
    working = true;
    try {
      await auth.enter(email.trim(), password, creating ? 'register' : 'login', chosenHandle);
    } catch (failure) {
      error = (failure as Error).message;
      password = '';
      conferma = '';
    } finally {
      working = false;
    }
  }
</script>

{#snippet lead()}
  {#if invito}
    <b>@{invito.ownerHandle}</b> ti apre la mappa «{invito.mapName}».
    {creating ? 'Crea il tuo accesso, e ci sei dentro.' : 'Entra con il tuo accesso, e ci sei dentro.'}
  {:else if creating}
    Un nome, un'email e una password di almeno otto caratteri.
  {/if}
{/snippet}

<Gate
  title={invito ? 'Ti hanno invitato su una mappa' : creating ? 'Crea il tuo accesso' : 'Bentornato'}
  lead={invito || creating ? lead : undefined}
  onsubmit={submit}
>
  <div class="stops">
    <Stop icon="mail" color="#2f6fed" label="Email">
      <TextField
        kind="email"
        name="email"
        autocomplete="username"
        placeholder="tu@esempio.it"
        required
        bind:value={email}
      />
    </Stop>

    <Stop icon="lock" color="#6a4c93" label="Password">
      <span class="peek">
        <TextField
          kind={mostra ? 'text' : 'password'}
          name="password"
          autocomplete={creating ? 'new-password' : 'current-password'}
          placeholder={creating ? 'Almeno 8 caratteri' : '••••••••'}
          required
          minlength={creating ? 8 : undefined}
          bind:value={password}
        />
        <button
          type="button"
          class="peek-btn"
          title={mostra ? 'Nascondi' : 'Mostra'}
          aria-label={mostra ? 'Nascondi la password' : 'Mostra la password'}
          aria-pressed={mostra}
          onclick={() => (mostra = !mostra)}
        >
          <Icon name={mostra ? 'eyeOff' : 'eye'} />
        </button>
      </span>
    </Stop>

    {#if creating}
      <Stop icon="check" color="#6a4c93" label="Conferma password">
        <span class="peek">
          <TextField
            kind={mostra ? 'text' : 'password'}
            name="conferma"
            autocomplete="new-password"
            placeholder="La stessa di sopra"
            required
            minlength={8}
            bind:value={conferma}
          />
          <button
            type="button"
            class="peek-btn"
            title={mostra ? 'Nascondi' : 'Mostra'}
            aria-label={mostra ? 'Nascondi la password' : 'Mostra la password'}
            aria-pressed={mostra}
            onclick={() => (mostra = !mostra)}
          >
            <Icon name={mostra ? 'eyeOff' : 'eye'} />
          </button>
        </span>
        {#if conferma && password !== conferma}
          <span class="stop-hint stop-no">Non coincide con quella sopra.</span>
        {/if}
      </Stop>
    {/if}

    {#if creating}
      <Stop icon="handle" color="#1f7a5c" label="Nome utente">
        <!-- quello che si scrive diventa subito un nome utente valido: le
             maiuscole e gli spazi si tolgono mentre si batte, invece di
             farlo scoprire dopo con un rifiuto -->
        <TextField
          name="handle"
          autocomplete="username"
          placeholder="nome-utente"
          required
          minlength={3}
          maxlength={20}
          value={chosenHandle}
          oninput={(scritto: string) => {
            chosen = true;
            handle = toHandle(scritto);
          }}
        />
        <span class="stop-hint">
          Nell'app ti vedrai scritto così: <b>@{chosenHandle || 'nome-utente'}</b>
        </span>
      </Stop>
    {/if}
  </div>

  {#if error}
    <Alert
      message={error}
      action={errorLeadsBack
        ? {
            label: 'Entra',
            run: () => {
              wantsAccount = false;
              error = '';
            },
          }
        : undefined}
    />
  {/if}

  <Button look="primary" type="submit" extra="go" disabled={working}>
    {working ? 'Un attimo…' : creating ? "Crea l'accesso" : 'Entra'}
    <Icon name="submit" />
  </Button>

  {#if !firstRun && !errorLeadsBack}
    {#if auth.signupOpen}
      <p class="route-foot">
        {creating ? 'Hai già un accesso?' : "Non ce l'hai ancora?"}
        <button
          type="button"
          class="route-switch"
          onclick={() => {
            wantsAccount = !wantsAccount;
            error = '';
          }}
        >
          {creating ? 'Entra' : 'Creane uno'}
        </button>
      </p>
    {:else}
      <p class="route-foot">Le iscrizioni sono chiuse, questo indice ha già i suoi.</p>
    {/if}
  {/if}
</Gate>

<style>
  /* due tappe di un percorso: il tratteggio le tiene insieme */
  .stops {
    position: relative;
    display: grid;
    gap: 14px;
  }

  /* l'occhiolino sta dentro al campo, all'altezza del testo */
  .peek { position: relative; display: block; }

  .peek :global(.text-field) { width: 100%; padding-right: 40px; }

  .peek-btn {
    position: absolute;
    top: 50%;
    right: 5px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-top: -15px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink-3);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .peek-btn:hover { background: var(--sunken); color: var(--ink-2); }
  .peek-btn[aria-pressed="true"] { color: var(--ink-2); }
  .peek-btn :global(.ico) { width: 16px; height: 16px; }

  /* quando le due non coincidono lo si dice subito, sotto al campo */
  .stops :global(.stop-no) { color: color-mix(in srgb, var(--danger) 85%, var(--ink-3)); }

  /* i campi dentro le tappe sono di un altro componente: vanno raggiunti */
  .stops :global(.stop-hint) {
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stops :global(.stop-hint b) { font-weight: 560; color: var(--ink-2); }

  .stops::before {
    content: "";
    position: absolute;
    left: 17px;
    top: 34px;
    bottom: 34px;
    width: 0;
    border-left: 2px dashed color-mix(in srgb, var(--ink-3) 45%, transparent);
  }

  .route-foot {
    margin: -8px 0 0;
    font-size: 12px;
    color: var(--ink-3);
    text-align: center;
  }

  .route-switch {
    border: 0;
    padding: 2px 4px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-weight: 560;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

</style>
