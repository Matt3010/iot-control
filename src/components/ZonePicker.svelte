<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { fusi, fusoDelBrowser } from '../lib/fuso';
  import { toast } from '../lib/toast.svelte';
  import { ui } from '../lib/ui.svelte';
  import SearchPicker from './SearchPicker.svelte';

  /**
   * Scegliere il fuso orario, da dentro una finestra.
   *
   * Accanto a ogni fuso c'è l'ora che è là adesso, perché è quella che si
   * riconosce — «Europe/Rome» si legge, ma «le 12:04» si vede subito se è
   * la propria. Quello del browser sta in cima, se è diverso: è il più
   * probabile.
   */
  const ora = (tz: string): string =>
    new Date().toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit', timeZone: tz });

  const voci = fusi().map((id) => ({ id, name: id.replaceAll('_', ' '), note: ora(id) }));
  const qui = fusoDelBrowser();

  async function scegli(tz: string): Promise<void> {
    try {
      await auth.update({ tz });
      ui.closeModal();
      toast.show(`Le scene partono all'ora di ${tz.replaceAll('_', ' ')}`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<SearchPicker
  {voci}
  chiave="fusi"
  placeholder="Cerca una città o una zona"
  vuoto="Nessun fuso con questo nome."
  scelta={auth.tz}
  onpick={(tz: string) => void scegli(tz)}
>
  {#snippet prima()}
    {#if qui !== auth.tz}
      <button type="button" class="search-picker-voce is-qui" onclick={() => void scegli(qui)}>
        <span class="nome">{qui.replaceAll('_', ' ')}<em>questo browser</em></span>
        <span class="ora">{ora(qui)}</span>
      </button>
    {/if}
  {/snippet}
</SearchPicker>

<style>
  .is-qui { background: var(--sunken); }

  .nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .nome em { margin-left: 8px; font-style: normal; font-size: 11px; color: var(--ink-3); }

  .ora { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--ink-3); }
</style>
