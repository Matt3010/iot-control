<script lang="ts">
  import { devices } from '../lib/devices.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import SceneStack from './SceneStack.svelte';

  /**
   * Le scene, in una pagina loro.
   *
   * Stavano nella colonna degli agenti, e non ci stavano: una scena non
   * appartiene a un agente — «sera» chiude le tende di una stanza e accende
   * l'abat-jour di un'altra — e per arrivarci bisognava scorrere oltre tutte
   * le macchine di casa.
   */
</script>

<PageShell
  title="Scene"
  count={devices.scenes.length}
  lead="Più cose che partono insieme, ognuna con la sua azione, così che «sera» chiuda le tende e accenda l'abat-jour. Una scena può toccare dispositivi di agenti diversi. Premerle a mano una per volta si vede — partono a mezzo secondo di distanza."
>
  <PageCard>
    <SceneStack />
  </PageCard>
</PageShell>

