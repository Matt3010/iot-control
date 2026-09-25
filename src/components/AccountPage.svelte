<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { fusoDelBrowser } from '../lib/fuso';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import TextField from './TextField.svelte';
  import ZonePicker from './ZonePicker.svelte';

  /**
   * Il proprio account: come ti chiami, in che fuso sono le tue ore, la
   * password, e la porta per uscire.
   *
   * Prima c'era solo la porta, dietro la «@» in cima alla home, e il resto non
   * si poteva cambiare da nessuna parte. Il fuso soprattutto: le scene
   * partono all'ora dell'account, e un'ora che non si vede e non si cambia è
   * un orario di cui non ci si può fidare.
   *
   * L'email non si cambia da qui. È la chiave con cui altri ti hanno aperto
   * le loro mappe, e cambiarla vorrebbe dire perderle senza accorgersene.
   */
  let attuale = $state('');
  let nuova = $state('');
  let occupato = $state(false);

  const qui = fusoDelBrowser();

  // l'ora che è adesso nel fuso dell'account, e che passa
  let adesso = $state(new Date());
  $effect(() => {
    const battito = setInterval(() => (adesso = new Date()), 30_000);
    return () => clearInterval(battito);
  });
  const ora = $derived(adesso.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit', timeZone: auth.tz }));

  async function rinomina(handle: string): Promise<void> {
    if (!handle || handle === auth.account?.handle) return;
    try {
      await auth.update({ handle });
      toast.show(`Adesso ti chiami @${handle}`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  function scegliFuso(): void {
    ui.openModal({ title: 'Fuso orario', view: ZonePicker });
  }

  async function usaQuesto(): Promise<void> {
    try {
      await auth.update({ tz: qui });
      toast.show(`Le scene partono all'ora di ${qui.replaceAll('_', ' ')}`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function password(): Promise<void> {
    occupato = true;
    try {
      await auth.changePassword(attuale, nuova);
      attuale = '';
      nuova = '';
      toast.show('Password cambiata');
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      occupato = false;
    }
  }
</script>

<PageShell title="Account" siblings={false} layout="rows">
  {#if auth.account}
    <PageCard>
      <span class="eyebrow">Chi sei</span>
      <label class="campo">
        <span class="etichetta">Nome utente</span>
        <TextField value={auth.account.handle} label="Nome utente" maxlength={20} onchange={(scritto: string) => void rinomina(scritto.trim().toLowerCase())} />
        <span class="nota">È come ti vedono gli altri, @{auth.account.handle}. Da 3 a 20 caratteri fra lettere, numeri e trattini.</span>
      </label>
      <div class="campo">
        <span class="etichetta">Email</span>
        <span class="valore">{auth.account.email}</span>
        <span class="nota">Non si cambia da qui, perché è la chiave con cui altri ti hanno aperto le loro mappe.</span>
      </div>
    </PageCard>

    <PageCard>
      <span class="eyebrow">Fuso orario</span>
      <div class="riga">
        <span class="valore">
          {auth.tz.replaceAll('_', ' ')}<em>adesso sono le {ora}</em>
        </span>
        <Button look="ghost" size="sm" onclick={scegliFuso}>Cambia</Button>
      </div>
      <span class="nota">Le scene partono all'ora di questo fuso, anche quando le guardi da dove è un'altra ora.</span>
      {#if qui !== auth.tz}
        <!-- il browser è altrove: può essere un viaggio, o un fuso scelto
             male. Lo si dice, e decide chi guarda -->
        <div class="riga is-avviso">
          <span class="nota">Questo browser è sull'ora di {qui.replaceAll('_', ' ')}.</span>
          <Button look="link" onclick={() => void usaQuesto()}>Usa questo</Button>
        </div>
      {/if}
    </PageCard>

    <PageCard>
      <span class="eyebrow">Password</span>
      <form class="password" onsubmit={(event) => (event.preventDefault(), void password())}>
        <TextField kind="password" placeholder="Quella di adesso" bind:value={attuale} label="Password di adesso" />
        <TextField kind="password" placeholder="Quella nuova, almeno otto caratteri" bind:value={nuova} label="Password nuova" />
        <Button look="primary" type="submit" disabled={occupato || !attuale || nuova.length < 8}>Cambia password</Button>
      </form>
    </PageCard>

    <PageCard>
      <div class="riga">
        <span class="nota">Le tue mappe restano dove sono. Si rientra quando vuoi.</span>
        <Button
          look="danger"
          onclick={(event: MouseEvent) =>
            ui.askSure(event.currentTarget as HTMLElement, {
              title: `Uscire da @${auth.account?.handle ?? ''}?`,
              verb: 'Esci',
              no: 'Resto',
              onYes: () => auth.leave(),
            })}
        >
          Esci
        </Button>
      </div>
      <!-- per quando un posto dove sei entrato non è più tuo: un telefono
           perso, un computer lasciato acceso da qualche parte -->
      <div class="riga is-avviso">
        <span class="nota">Anche dagli altri browser e telefoni dove sei entrato. Poi si rientra ovunque con la password.</span>
        <Button
          look="ghost"
          size="sm"
          onclick={(event: MouseEvent) =>
            ui.askSure(event.currentTarget as HTMLElement, {
              title: 'Uscire da tutte le sessioni?',
              detail: 'Esci da qui e da tutti gli altri posti dove sei entrato con questo account.',
              verb: 'Esci ovunque',
              no: 'Resto',
              onYes: () => void auth.leaveEverywhere().catch((error: Error) => toast.show(error.message)),
            })}
        >
          Esci ovunque
        </Button>
      </div>
    </PageCard>
  {/if}
</PageShell>

<style>
  .campo { display: grid; gap: 5px; }

  .etichetta { font-size: 12px; font-weight: 560; color: var(--ink-2); }

  .valore { font-size: 13.5px; color: var(--ink); }

  .valore em { margin-left: 8px; font-style: normal; font-size: 12px; color: var(--ink-3); }

  .nota { font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

  .riga { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

  .riga.is-avviso { padding-top: 8px; border-top: 1px solid var(--hairline-soft); }

  .password { display: grid; gap: 8px; }

  .password :global(.btn) { justify-self: start; }
</style>
