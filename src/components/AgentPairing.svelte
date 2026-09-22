<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { PairingStep } from '../lib/types';
  import Button from './Button.svelte';
  import Qr from './Qr.svelte';

  /**
   * Collegare l'account Tuya senza uscire da qui.
   *
   * È una conversazione a due battute: Tuya vuole prima un codice che sta
   * nell'app, e poi un QR da inquadrare con la stessa app. Il QR arriva come
   * stringa e lo disegniamo noi; il resto lo guida Home Assistant, che ci dice
   * passo per passo cosa chiedere.
   */
  let { agent }: { agent: Agent } = $props();

  let step = $state<PairingStep | null>(null);
  let busy = $state(false);
  /** Quello che la persona sta scrivendo, per nome del campo. */
  let answers = $state<Record<string, string>>({});

  const closed = $derived(!step || step.kind === 'done');

  async function go(action: 'start' | 'submit' | 'cancel', input: Record<string, string> = {}) {
    busy = true;
    try {
      const next = await devices.pair(agent, action, {
        handler: 'tuya',
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
      if (next?.kind === 'done') toast.show('Account collegato: i dispositivi stanno arrivando');
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      busy = false;
    }
  }

  /** Il passo col QR non ha campi: si conferma e basta. */
  const submit = () => go('submit', answers);
</script>

{#if closed}
  <Button look="link" disabled={!agent.online || busy} onclick={() => go('start')}>
    {agent.online ? 'Collega un account Tuya' : 'Collegalo, poi si potrà aggiungere Tuya'}
  </Button>
{:else if step}
  <div class="pair" class:is-busy={busy}>
    {#if step.error}
      <p class="wrong">{step.error}</p>
    {/if}

    {#if step.kind === 'failed'}
      <div class="acts">
        <Button look="ghost" size="sm" disabled={busy} onclick={() => go('start')}>Riprova</Button>
        <Button look="link" disabled={busy} onclick={() => (step = null)}>Lascia stare</Button>
      </div>
    {:else if step.qr}
      <p class="say">Inquadra questo codice con l'app <b>Smart Life</b>, poi conferma qui sotto.</p>
      <Qr data={step.qr} label="Codice da inquadrare con Smart Life" />
      <div class="acts">
        <Button look="primary" size="sm" disabled={busy} onclick={submit}>Ho inquadrato</Button>
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {:else if step.fields.length}
      <p class="say">
        Serve il tuo codice Tuya. Nell'app <b>Smart Life</b>: <i>Io</i> → l'ingranaggio in alto →
        <i>Account e sicurezza</i>.
      </p>
      {#each step.fields as field (field.name)}
        <input
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Il codice dall'app"
          aria-label="Codice Tuya"
          bind:value={
            () => answers[field.name] ?? '', (value) => (answers = { ...answers, [field.name]: value })
          }
          onkeydown={(event) => event.key === 'Enter' && submit()}
        />
      {/each}
      <div class="acts">
        <Button look="primary" size="sm" disabled={busy} onclick={submit}>Continua</Button>
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {:else}
      <p class="say">Sto aspettando Tuya…</p>
      <div class="acts">
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {/if}
  </div>
{/if}

<style>
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

  /* quello che Tuya ha da ridire: il motivo arriva intero, non tradotto in
     "qualcosa è andato storto" */
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
