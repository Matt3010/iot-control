<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { toast } from '../lib/toast.svelte';
  import Icon from './Icon.svelte';

  /**
   * La fascia che dice di chi sono le mappe che stai guardando.
   *
   * Quando entri in casa d'altri non cambia niente: stesse mappe, stessi
   * tasti, stesso cestino. È proprio per quello che ci vuole — senza, sposti
   * un pin e non sai di averlo spostato a qualcun altro. Sta in alto al
   * centro, dove non c'è nient'altro, e non se ne va finché non torni a casa.
   */
  const acting = $derived(auth.account?.actingAs ?? null);

  let leaving = $state(false);

  async function comeBack() {
    if (leaving) return;
    leaving = true;
    try {
      await auth.comeBack();
    } catch (error) {
      leaving = false;
      toast.show((error as Error).message);
    }
  }
</script>

{#if acting}
  <div class="bar" data-guest>
    <Icon name="key" />
    <span class="what">
      Stai lavorando nelle mappe di <b>{acting.handle}</b>
    </span>
    <button type="button" onclick={comeBack} disabled={leaving}>
      {leaving ? 'Torno…' : 'Torna al tuo'}
    </button>
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-hint);
    display: flex;
    align-items: center;
    gap: 9px;
    max-width: calc(100vw - 28px);
    padding: 7px 7px 7px 13px;
    border-radius: 99px;
    /* l'arancione degli agenti a metà servizio: nell'app vuol dire «guarda
       che qui c'è una condizione», ed è esattamente questa */
    background: #b06c0c;
    color: white;
    box-shadow: var(--shadow-2);
    animation: drop-in 0.3s var(--ease);
  }

  .bar :global(.ico) { width: 15px; height: 15px; flex: none; opacity: 0.9; }

  .what {
    min-width: 0;
    font-size: 12.5px;
    letter-spacing: -0.006em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .what b { font-weight: 650; }

  button {
    flex: none;
    padding: 5px 11px;
    border: 0;
    border-radius: 99px;
    background: rgb(255 255 255 / 0.18);
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-weight: 560;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.16s;
  }

  button:hover { background: rgb(255 255 255 / 0.3); }

  button:disabled { opacity: 0.6; cursor: default; }

  /* al telefono la fascia scende sotto il pannello, se no lo copre */
  @media (max-width: 600px) {
    .bar { top: auto; bottom: var(--sopra-al-tasto); }
  }
</style>
