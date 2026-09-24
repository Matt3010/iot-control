<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import Alert from './Alert.svelte';
  import Icon from './Icon.svelte';
  import MapBackdrop from './MapBackdrop.svelte';
  import Stop from './Stop.svelte';
  import TextField from './TextField.svelte';
  import Button from './Button.svelte';

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
  let wantsAccount = $state(false);
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

<div class="gate">
  <MapBackdrop />

  <form class="route surface" onsubmit={submit}>
    <header class="route-head">
      <span class="wordmark"><Icon name="pin" /> Place Index</span>
      <h1>{creating ? 'Crea il tuo accesso' : 'Bentornato'}</h1>
      {#if creating}
        <p>Un nome, un'email e una password di almeno otto caratteri.</p>
      {/if}
    </header>

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
  </form>
</div>

<style>
  .gate {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    overflow: hidden;
  }

  /* la mappa dietro resta un paesaggio: si guarda, non si tocca */
  .gate::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(120% 90% at 50% 40%, rgb(var(--base) / 0.1), rgb(var(--base) / 0.72));
    pointer-events: none;
  }

  .route {
    position: relative;
    z-index: 1;
    width: min(420px, 100%);
    padding: 22px 22px 20px;
    display: grid;
    gap: 18px;
    animation: rise 0.45s var(--ease);
  }

  .route-head { display: grid; gap: 6px; }

  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 620;
    letter-spacing: -0.01em;
    color: var(--ink-3);
  }

  .wordmark :global(.ico) { width: 15px; height: 15px; }

  h1 {
    margin: 2px 0 0;
    font-size: 22px;
    font-weight: 640;
    letter-spacing: -0.028em;
  }

  .route-head p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--ink-3);
  }

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

  .route :global(.go) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 18px;
    font-size: 14.5px;
  }

  .route :global(.go .ico) { width: 17px; height: 17px; }
  .route :global(.go:disabled) { opacity: 0.6; }

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

  @media (max-width: 600px) {
    .route { padding: 18px; }
    h1 { font-size: 20px; }
  }
</style>
