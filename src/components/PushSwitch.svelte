<script lang="ts">
  import { push } from '../lib/push.svelte';
  import { toast } from '../lib/toast.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';

  /**
   * Accendere e spegnere gli avvisi su questa macchina.
   *
   * Una levetta e una riga che dice a che punto siamo, perché fra «ho detto
   * di sì» e «mi arriva davvero una notifica» ci sono sei cose che possono
   * andare storte e quasi nessuna dipende da noi. Dire quale manca è l'unica
   * cosa utile che si può fare: «non funziona» non ha mai aiutato nessuno.
   */
  $effect(() => {
    void push.look();
  });

  async function flip(wanted: boolean): Promise<void> {
    if (!wanted) {
      await push.disable();
      toast.show('Avvisi spenti su questa macchina');
      return;
    }

    const acceso = await push.enable();
    if (acceso) toast.show('Avvisi accesi: te ne mando uno di prova');
    else if (push.permission === 'denied') toast.show('Il browser li ha bloccati: si riaccendono dalle sue impostazioni');
    else toast.show('Non si è riusciti ad accenderli');

    if (acceso) void push.tryIt().catch(() => undefined);
  }
</script>

<div class="avvisi">
  <div class="testa">
    <span class="eyebrow">Avvisi</span>
    {#if push.on}
      <Button look="link" disabled={push.busy} onclick={() => void push.tryIt()}>Provane uno</Button>
    {/if}
  </div>

  {#if push.can}
    <Switch
      checked={push.on}
      disabled={push.busy}
      label="Mandameli su questa macchina"
      note={push.on
        ? 'Quando un posto smette di rispondere, o quando succede qualcosa che hai chiesto di sapere.'
        : 'Spenti: qui non arriva niente, nemmeno quando un posto smette di rispondere.'}
      onchange={(value: boolean) => void flip(value)}
    />

    {#if push.permission === 'denied'}
      <p class="nota">
        <Icon name="alert" />
        Il browser li ha bloccati per questo sito. Si riaccendono dalle sue impostazioni, alla voce
        delle notifiche — da qui non si può.
      </p>
    {/if}
  {:else if push.needsInstall}
    <!-- Non è un difetto nostro e non si aggira: tanto vale dire come si fa. -->
    <p class="nota">
      <Icon name="alert" />
      Su iPhone gli avvisi arrivano solo se aggiungi questa pagina alla schermata home: il tasto
      <b>Condividi</b>, poi <b>Aggiungi alla schermata Home</b>. Da lì si accendono.
    </p>
  {:else}
    <p class="nota">Questo browser non sa ricevere avvisi.</p>
  {/if}
</div>

<style>
  .avvisi {
    display: grid;
    gap: 9px;
  }

  .testa {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  /* quello che manca, detto per esteso: una riga in più qui vale un supporto
     tecnico in meno */
  .nota {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-3);
  }

  .nota b { font-weight: 600; color: var(--ink-2); }

  .nota :global(.ico) {
    flex: none;
    width: 13px;
    height: 13px;
    margin-top: 1px;
    color: var(--warn);
  }
</style>
