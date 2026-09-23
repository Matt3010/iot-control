<script lang="ts">
  import { devices } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import AddRow from './AddRow.svelte';
  import PageShell from './PageShell.svelte';
  import SceneCard from './SceneCard.svelte';

  /**
   * Le scene, una scheda per scena.
   *
   * Stavano tutte dentro un riquadro solo, impilate, e non si capiva dove
   * finisse una e cominciasse l'altra. Qui ognuna ha il suo bordo, come un
   * agente: dentro c'è il tasto che la fa partire e le righe che esegue,
   * sotto quello che si fa una volta sola.
   */
  let newName = $state('');

  async function create(name: string) {
    try {
      await devices.createScene(name, []);
      newName = '';
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<PageShell
  title="Scene"
  count={devices.scenes.length}
  lead="Più cose che partono insieme, ognuna con la sua azione, così che «sera» chiuda le tende e accenda l'abat-jour. Una scena può toccare dispositivi di agenti diversi. Premerle a mano una per volta si vede — partono a mezzo secondo di distanza."
>
  {#each devices.scenes as scene (scene.id)}
    <!-- il riquadro lo disegna gia' il comando della scena, come per gli
         agenti: un secondo bordo intorno sarebbe una scheda dentro l'altra -->
    <section class="card">
      <SceneCard {scene} />
    </section>
  {/each}

  <section class="card is-new">
    <span class="eyebrow">Un'altra scena</span>
    <AddRow placeholder="Nome scena — es. Sera" title="Crea scena" bind:value={newName} onadd={create} />
    <p class="once">
      Nasce vuota. Da «Cosa fa» le dici quali dispositivi muovere, e quella riga vale per tutti gli
      agenti che hai.
    </p>
  </section>
</PageShell>

<style>
  .card {
    /* una scheda non si spezza fra due colonne, si sposta intera */
    break-inside: avoid;
    display: grid;
    align-content: start;
    gap: 10px;
    min-width: 0;
    /* lo stacco verticale è suo, non della colonna */
    margin: 0 0 14px;
  }

  /* quella del «creane un'altra» è tratteggiata come per gli agenti e per le
     mappe, perché è un posto vuoto da riempire e non una cosa che c'è già */
  .card.is-new {
    padding: 14px;
    border-radius: var(--r-md);
    border: 1px dashed var(--hairline);
  }

  .once { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }
</style>
