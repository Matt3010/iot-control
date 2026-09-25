<script lang="ts">
  import { gruppoDi } from '../lib/condizioni';
  import { devices, type Scene, type SceneConditionGroup } from '../lib/devices.svelte';
  import SceneConditionGroupView from './SceneConditionGroup.svelte';

  /**
   * Il terzo passo di una scena: a quali condizioni parte da sola.
   *
   * Si guardano nel momento in cui qualcosa la farebbe partire, e valgono
   * solo per le partenze automatiche: premuta a mano, una scena parte
   * sempre, perché chi la preme la vuole adesso. Come si legano fra loro lo
   * dice il gruppo più esterno, che qui si salva a ogni cambiamento.
   */
  let { scene }: { scene: Scene } = $props();

  const triggers = $derived(scene.triggers ?? []);
  /** Se parte da sola in qualche modo: senza, le condizioni non hanno a cosa servire. */
  const automatica = $derived(!!(scene.when && !scene.when.off) || triggers.length > 0);

  /*
   * Giorni e ore valgono solo per le partenze da un dispositivo: l'orario ha
   * già i suoi giorni e il suo minuto, e offrirli anche qui era chiedere due
   * volte la stessa cosa, con il rischio di una fascia che non lo contiene.
   */
  const daDispositivo = $derived(triggers.length > 0);

  const salva = (only: SceneConditionGroup) => void devices.patchScene(scene, { only });
</script>

{#if automatica}
  <span class="nota">
    <!-- lo spazio fra le due frasi è scritto: quello a capo dentro al blocco
         Svelte lo toglie, e le frasi si attaccavano («sempre.Giorni») -->
    Valgono quando parte da sola. Premuta a mano parte sempre.{#if daDispositivo && scene.when && !scene.when.off}{' '}Giorni
      e ore valgono per i dispositivi, perché l’orario ha già i suoi.{/if}
  </span>

  <SceneConditionGroupView gruppo={gruppoDi(scene.only)} {daDispositivo} onchange={salva} />
{/if}

<style>
  .nota { font-size: 11px; color: var(--ink-3); }
</style>
