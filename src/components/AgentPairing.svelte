<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { PairingStep } from '../lib/types';
  import Button from './Button.svelte';
  import Qr from './Qr.svelte';

  /**
   * Collegare un account senza uscire da qui.
   *
   * Ogni marca ha il suo rito — Tuya vuole un codice e poi un QR, eWeLink
   * email e password — ma il dialogo è lo stesso: Home Assistant dice cosa
   * chiedere, noi lo chiediamo, e quando c'è un QR lo disegniamo.
   *
   * eWeLink Home Assistant non ce l'ha di serie: se lo scegli, l'agente se lo
   * installa al momento. Non prima: nessuno scarica roba di terzi su una
   * macchina per un account che non userà mai.
   */
  let { agent }: { agent: Agent } = $props();

  const ACCOUNTS = [
    { handler: 'tuya', label: 'Tuya' },
    { handler: 'sonoff', label: 'eWeLink' },
  ] as const;

  /** Come si chiamano i campi di HA, detto in italiano. */
  const LABELS: Record<string, string> = {
    user_code: 'Codice utente',
    username: 'Email o numero di telefono',
    password: 'Password',
    email: 'Email',
    host: 'Indirizzo',
  };

  const named = (name: string) => LABELS[name] ?? name.replace(/_/g, ' ');

  let step = $state<PairingStep | null>(null);
  let handler = $state<string>('tuya');
  let busy = $state(false);
  /** Quello che la persona sta scrivendo, per nome del campo. */
  let answers = $state<Record<string, string>>({});

  const closed = $derived(!step || step.kind === 'done');
  const which = $derived(ACCOUNTS.find((one) => one.handler === handler)?.label ?? handler);

  async function go(action: 'start' | 'submit' | 'cancel', input: Record<string, string> = {}) {
    busy = true;
    try {
      const next = await devices.pair(agent, action, {
        handler,
        ...(step?.flowId ? { flowId: step.flowId } : {}),
        ...(action === 'submit' ? { input } : {}),
      });

      if (action === 'cancel') {
        step = null;
        answers = {};
        return;
      }

      step = next;
      answers = {};
      if (next?.kind === 'done') toast.show(`${which} collegato: i dispositivi stanno arrivando`);
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      busy = false;
    }
  }

  function begin(chosen: string) {
    handler = chosen;
    step = null;
    void go('start');
  }

  /**
   * Un codice incollato si porta dietro gli spazi ai bordi, e certi codici
   * distinguono maiuscole e minuscole: si tolgono quelli, non il resto.
   */
  const submit = () =>
    go(
      'submit',
      Object.fromEntries(Object.entries(answers).map(([name, value]) => [name, value.trim()])),
    );
</script>

{#if closed}
  <div class="offer">
    <span class="lead">Collega un account:</span>
    {#each ACCOUNTS as account (account.handler)}
      <Button
        look="ghost"
        size="sm"
        disabled={!agent.online || busy}
        title={agent.online ? `Collega ${account.label}` : "L'agente non è collegato"}
        onclick={() => begin(account.handler)}
      >
        {account.label}
      </Button>
    {/each}
  </div>
{:else if step}
  <div class="pair" class:is-busy={busy}>
    <span class="eyebrow">{which}</span>

    {#if step.error}
      <p class="wrong">{step.error}</p>
    {/if}

    {#if step.kind === 'failed'}
      <div class="acts">
        <Button look="ghost" size="sm" disabled={busy} onclick={() => begin(handler)}>Riprova</Button>
        <Button look="link" disabled={busy} onclick={() => (step = null)}>Lascia stare</Button>
      </div>
    {:else if step.kind === 'busy'}
      <p class="say">{step.note}</p>
      <div class="acts">
        <Button look="ghost" size="sm" disabled={busy} onclick={() => begin(handler)}>Riprova</Button>
        <Button look="link" disabled={busy} onclick={() => (step = null)}>Più tardi</Button>
      </div>
    {:else if step.qr}
      <p class="say">
        Inquadra questo codice con l'app <b>Smart Life</b> (o Tuya Smart). Quando l'app ha finito,
        conferma qui sotto.
      </p>
      <Qr data={step.qr} label="Codice da inquadrare" />
      <div class="acts">
        <Button look="primary" size="sm" disabled={busy} onclick={submit}>Ho inquadrato</Button>
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {:else if step.fields.length}
      {#if handler === 'tuya'}
        <p class="say">
          Serve il tuo codice utente. Nell'app <b>Smart Life</b> (o Tuya Smart):
          <i>Impostazioni</i> → <i>Account e sicurezza</i>, alla voce <i>User Code</i>.
        </p>
        <p class="say careful">Copialo <b>esattamente</b> com'è: maiuscole e minuscole contano.</p>
      {:else}
        <p class="say">Entra con le stesse credenziali che usi nell'app <b>eWeLink</b>.</p>
      {/if}

      {#each step.fields as field (field.name)}
        <label class="field">
          <span class="eyebrow">{named(field.name)}</span>
          <input
            type={field.secret ? 'password' : 'text'}
            autocomplete={field.secret ? 'current-password' : 'off'}
            spellcheck="false"
            autocapitalize="off"
            autocorrect="off"
            bind:value={
              () => answers[field.name] ?? '',
              (value) => (answers = { ...answers, [field.name]: value })
            }
            onkeydown={(event) => event.key === 'Enter' && submit()}
          />
        </label>
      {/each}

      <div class="acts">
        <Button look="primary" size="sm" disabled={busy} onclick={submit}>Continua</Button>
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {:else}
      <p class="say">Sto aspettando {which}…</p>
      <div class="acts">
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .offer { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }

  .lead { font-size: 11.5px; color: var(--ink-3); margin-right: 2px; }

  .pair {
    display: grid;
    gap: 9px;
    min-width: 0;
    animation: rise 0.2s var(--ease);
  }

  /* mentre la battuta è in volo non si preme due volte */
  .pair.is-busy { opacity: 0.6; }

  .say { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-2); }

  .say b { font-weight: 600; color: var(--ink); }

  .say i { font-style: normal; font-weight: 560; color: var(--ink); }

  /* La tastiera del telefono mette la maiuscola alla prima lettera da sola, e
     quel codice diventa sbagliato senza che tu abbia toccato niente. Il campo
     la disattiva; questa riga lo dice comunque, perché c'è chi lo ricopia. */
  .careful { color: var(--ink-3); }

  /* quello che la marca ha da ridire: il motivo arriva intero, non tradotto
     in "qualcosa è andato storto" */
  .wrong {
    margin: 0;
    padding: 7px 10px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--danger);
  }

  .acts { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
</style>
