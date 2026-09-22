<script lang="ts">
  import { placeAnchored } from '../lib/popover';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';

  /**
   * La domanda attaccata al tasto che l'ha fatta nascere. Dice per nome cosa
   * succede e cosa si porta dietro.
   *
   * Quasi sempre è l'ultimo passo prima di una cosa che non torna indietro, e
   * allora il tasto è rosso. Con `tone: 'plain'` invece è un bivio — «privato
   * o pubblico?» — e lì il rosso direbbe che una delle due strade fa male.
   */
  const request = $derived(ui.sure!);
  const at = $derived(placeAnchored(request.anchor, 264, request.detail ? 132 : 108));

  function yes() {
    const run = request.onYes;
    ui.sure = null;
    run();
  }

  /** Anche il no può fare qualcosa: in un bivio l'altra strada è una strada. */
  function no() {
    const run = request.onNo;
    ui.sure = null;
    run?.();
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
    <Button look="ghost" size="sm" onclick={no}>{request.no ?? 'Annulla'}</Button>
    <Button look={request.tone === 'plain' ? 'primary' : 'danger-solid'} size="sm" onclick={yes}>
      {request.verb}
    </Button>
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

</style>
