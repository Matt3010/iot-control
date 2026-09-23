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

  /**
   * Se una prova è partita davvero.
   *
   * Quando il server dice che l'ha consegnata e sullo schermo non compare
   * niente, il guasto è rimasto uno solo e non è nostro: è il sistema che
   * non lascia passare le notifiche di questo browser. Si dice lì, appena
   * serve — dirlo prima sarebbe una riga di istruzioni per un problema che
   * quasi nessuno ha.
   */
  let partita = $state(false);

  async function flip(wanted: boolean): Promise<void> {
    if (!wanted) {
      await push.disable();
      toast.show('Avvisi spenti su questa macchina');
      return;
    }

    const acceso = await push.enable();
    if (acceso) toast.show('Avvisi accesi: te ne mando uno di prova');
    else if (push.permission === 'denied') toast.show('Il browser li ha bloccati: si riaccendono dalle sue impostazioni');
    else if (push.permission === 'default') toast.show('Avvisi non accesi: il permesso non è stato dato');
    else toast.show('Non si è riusciti ad accenderli');

    if (acceso) void prova();
  }

  /**
   * La prova, con l'esito.
   *
   * Premere e non vedere niente è la cosa peggiore proprio qui: se non arriva
   * nulla non si sa se il tasto non ha fatto niente o se è la notifica a non
   * essere passata, e sono due guasti diversi con due rimedi diversi.
   */
  async function prova(): Promise<void> {
    try {
      const { sent, failed } = await push.tryIt();
      partita = sent > 0;
      if (sent > 1) toast.show(`Avviso di prova mandato a ${sent} macchine`);
      else if (sent === 1) toast.show('Avviso di prova mandato: arriva fra un istante');
      else if (failed) toast.show('La consegna è stata respinta: non dipende da questa macchina');
      else toast.show('Nessuna macchina iscritta: spegni e riaccendi la levetta');
    } catch (error) {
      toast.show(`Prova non riuscita: ${(error as Error).message}`);
    }
  }
</script>

<div class="avvisi">
  <div class="testa">
    <span class="eyebrow">Avvisi</span>
    {#if push.on}
      <Button look="link" disabled={push.busy} onclick={() => void prova()}>Invia una prova</Button>
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

    {#if partita}
      <p class="nota">
        <Icon name="alert" />
        <span>Se non ne vedi arrivare nessuna, è il sistema a trattenerla: su Mac in
        <b>Impostazioni di Sistema › Notifiche</b>, su Windows in <b>Sistema › Notifiche</b>, il
        browser dev'essere fra quelli che possono mostrarle — e una modalità «non disturbare»
          accesa le mette da parte in silenzio.</span
        >
      </p>
    {:else if push.why}
      <!-- cos'è andato storto, per esteso: la levetta da sola direbbe solo
           che è tornata indietro -->
      <p class="nota">
        <Icon name="alert" />
        <span>{push.why}</span>
      </p>
    {:else if push.permission === 'denied'}
      <p class="nota">
        <Icon name="alert" />
        <span
          >Il browser li ha bloccati per questo sito. Si riaccendono dalle sue impostazioni, alla
          voce delle notifiche — da qui non si può.</span
        >
      </p>
    {/if}
  {:else if push.needsInstall}
    <!-- Non è un difetto nostro e non si aggira: tanto vale dire come si fa. -->
    <p class="nota">
      <Icon name="alert" />
      <span
        >Su iPhone gli avvisi arrivano solo se aggiungi questa pagina alla schermata home: il tasto
        <b>Condividi</b>, poi <b>Aggiungi alla schermata Home</b>. Da lì si accendono.</span
      >
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
     tecnico in meno.

     Il testo sta tutto dentro un blocco suo: in fila con l'icona, i pezzi in
     grassetto diventavano altrettante colonne e la frase si leggeva a
     scalini. */
  .nota {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-3);
  }

  .nota span { min-width: 0; }

  .nota b { font-weight: 600; color: var(--ink-2); }

  .nota :global(.ico) {
    flex: none;
    width: 13px;
    height: 13px;
    margin-top: 1px;
    color: var(--warn);
  }
</style>
