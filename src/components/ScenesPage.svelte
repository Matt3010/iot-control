<script lang="ts">
  import { devices } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import { vistaScene } from '../lib/viste.svelte';
  import AddRow from './AddRow.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import SceneCard from './SceneCard.svelte';
  import SceneTimeline from './SceneTimeline.svelte';
  import ViewControls from './ViewControls.svelte';

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
  lead="Più cose che partono insieme, ognuna con la sua azione, così che «sera» chiuda le tende e accenda l'abat-jour. Una scena può toccare dispositivi di agenti diversi."
>
  {#snippet tools()}<ViewControls vista={vistaScene} label="In che ordine le scene" />{/snippet}
  {#snippet strip()}<SceneTimeline scenes={devices.scenes} />{/snippet}

  {#each vistaScene.applica(devices.scenes) as scene (scene.id)}
    <!-- il riquadro lo disegna gia' il comando della scena, come per gli
         agenti: un secondo bordo intorno sarebbe una scheda dentro l'altra -->
    <section class="card">
      <SceneCard {scene} />
    </section>
  {/each}

  <PageCard dashed>
    <span class="eyebrow">Un'altra scena</span>
    <AddRow placeholder="Nome scena — es. Sera" title="Crea scena" bind:value={newName} onadd={create} />
    <p class="once">
      Nasce vuota. Con la matita le dici quali dispositivi muovere, e una sola scena può toccarne
      di agenti diversi.
    </p>
  </PageCard>
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


  .once { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }
</style>
