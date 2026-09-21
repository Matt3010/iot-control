<script lang="ts">
  import { placeAnchored } from '../lib/popover';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';

  /**
   * La domanda prima di una cosa che non torna indietro. Sta attaccata al
   * tasto che l'ha fatta nascere, dice per nome cosa sparisce e cosa si porta
   * dietro, e non chiede mai per cose che si possono rifare.
   */
  const request = $derived(ui.sure!);
  const at = $derived(placeAnchored(request.anchor, 264, request.detail ? 132 : 108));

  function yes() {
    const run = request.onYes;
    ui.sure = null;
    run();
  }
</script>

<div
  id="sure-popover"
  class="surface"
  role="alertdialog"
  aria-label={request.title}
  style:left="{at.left}px"
  style:top="{at.top}px"
>
  <p class="sure-what">{request.title}</p>
  {#if request.detail}<p class="sure-detail">{request.detail}</p>{/if}
  <div class="sure-acts">
    <Button look="ghost" extra="sure-no" onclick={() => (ui.sure = null)}>Annulla</Button>
    <Button look="danger-solid" onclick={yes}>{request.verb}</Button>
  </div>
</div>

<style>
  #sure-popover {
    position: absolute;
    z-index: var(--z-popover);
    width: 264px;
    padding: 14px;
    border-radius: var(--r-lg);
    background: var(--glass-strong);
    box-shadow: var(--shadow-3), inset 0 1px 0 var(--highlight);
    animation: rise 0.18s var(--ease);
  }

  .sure-what {
    margin: 0;
    font-size: 13.5px;
    font-weight: 560;
    letter-spacing: -0.012em;
    color: var(--ink);
  }

  .sure-detail {
    margin: 5px 0 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-3);
  }

  .sure-acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  /* i due tassi sono piccoli come la domanda: non è una schermata, è un foglietto */
  .sure-acts :global(.sure-no) { padding: 7px 12px; font-size: 12.5px; }
</style>
