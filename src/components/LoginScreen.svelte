<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import Icon from './Icon.svelte';
  import MapBackdrop from './MapBackdrop.svelte';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let working = $state(false);
  /** Chi arriva per primo crea; gli altri entrano, o creano se è permesso. */
  let wantsAccount = $state(false);

  const firstRun = $derived(auth.needsSetup);
  const creating = $derived(firstRun || wantsAccount);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    working = true;
    try {
      await auth.enter(email.trim(), password, creating ? 'register' : 'login');
    } catch (failure) {
      error = (failure as Error).message;
      password = '';
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
        <p>Bastano un'email e una password di almeno otto caratteri.</p>
      {/if}
    </header>

    <div class="stops">
      <label class="stop">
        <span class="stop-pin" style:--c="#2f6fed"><span class="stop-glyph"><Icon name="mail" /></span></span>
        <span class="stop-card">
          <span class="eyebrow">Email</span>
          <input
            type="email"
            name="email"
            autocomplete="username"
            placeholder="tu@esempio.it"
            required
            bind:value={email}
          />
        </span>
      </label>

      <label class="stop">
        <span class="stop-pin" style:--c="#6a4c93"><span class="stop-glyph"><Icon name="lock" /></span></span>
        <span class="stop-card">
          <span class="eyebrow">Password</span>
          <input
            type="password"
            name="password"
            autocomplete={creating ? 'new-password' : 'current-password'}
            placeholder={creating ? 'almeno otto caratteri' : '••••••••'}
            required
            minlength={creating ? 8 : undefined}
            bind:value={password}
          />
        </span>
      </label>
    </div>

    {#if error}
      <p class="route-error" role="alert">{error}</p>
    {/if}

    <button class="primary go" type="submit" disabled={working}>
      {working ? 'Un attimo…' : creating ? "Crea l'accesso" : 'Entra'}
      <Icon name="submit" />
    </button>

    {#if !firstRun}
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
        <p class="route-foot">Le iscrizioni sono chiuse: l'indice ha già i suoi.</p>
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

  .stops::before {
    content: "";
    position: absolute;
    left: 17px;
    top: 34px;
    bottom: 34px;
    width: 0;
    border-left: 2px dashed color-mix(in srgb, var(--ink-3) 45%, transparent);
  }

  .stop {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .stop-pin {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50% 50% 50% 6px;
    transform: rotate(-45deg);
    background: var(--c);
    background-image: linear-gradient(135deg, rgb(255 255 255 / 0.32), rgb(255 255 255 / 0) 55%);
    border: 2px solid rgb(255 255 255 / 0.92);
    box-shadow: 0 5px 14px -4px rgb(10 13 18 / 0.55), inset 0 -2px 6px rgb(0 0 0 / 0.14);
  }

  .stop-glyph {
    display: grid;
    place-items: center;
    transform: rotate(45deg);
    color: #fff;
  }

  .stop-glyph :global(.ico) { width: 16px; height: 16px; }

  .stop-card { display: grid; gap: 4px; flex: 1; min-width: 0; }

  .route-error {
    margin: -6px 0 0;
    font-size: 12.5px;
    color: var(--danger);
  }

  .go {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 18px;
    font-size: 14.5px;
  }

  .go :global(.ico) { width: 17px; height: 17px; }
  .go:disabled { opacity: 0.6; }

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

  @media (prefers-color-scheme: dark) {
    .stop-pin { border-color: rgb(255 255 255 / 0.8); }
  }

  @media (max-width: 600px) {
    .route { padding: 18px; }
    h1 { font-size: 20px; }
  }
</style>
