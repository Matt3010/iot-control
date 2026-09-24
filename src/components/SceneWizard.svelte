<script lang="ts">
  import { devices } from '../lib/devices.svelte';
  import { ui } from '../lib/ui.svelte';
  import SceneConditionsEditor from './SceneConditionsEditor.svelte';
  import SceneStepsEditor from './SceneStepsEditor.svelte';
  import SceneWhenEditor from './SceneWhenEditor.svelte';
  import Wizard from './Wizard.svelte';

  /**
   * Scrivere una scena, un passo per volta.
   *
   * Nella scheda c'erano tre cose diverse una sotto l'altra — cosa fa, quando
   * parte, a quali condizioni — e si leggevano come un elenco solo, con le
   * pastiglie dei dispositivi in fondo a mescolarsi coi giorni della
   * settimana. Qui ognuna ha il suo passo, e i tasti in fondo portano al
   * successivo. Ogni cambiamento si salva mentre lo si fa: «Fatto» chiude e
   * basta.
   *
   * Riceve l'identità della scena e non la scena, e la cerca ogni volta fra
   * quelle che ci sono: se un'altra scheda la cambia, il filo la sostituisce
   * con quella nuova, e qui deve arrivare quella.
   */
  let { sceneId, passo = 0 }: { sceneId: string; passo?: number } = $props();

  const scene = $derived(devices.scenes.find((one) => one.id === sceneId));

  // eliminata da un'altra parte mentre la si scriveva: non c'è più niente da scrivere
  $effect(() => {
    if (!scene) ui.closeModal();
  });

  const PASSI = [
    { id: 'cosa', titolo: 'Cosa fa' },
    { id: 'quando', titolo: 'Quando' },
    { id: 'se', titolo: 'Solo se' },
  ] as const;
</script>

{#if scene}
  <Wizard passi={[...PASSI]} bind:passo onfine={() => undefined}>
    {#snippet contenuto(id)}
      {#if id === 'cosa'}
        <SceneStepsEditor {scene} />
      {:else if id === 'quando'}
        <SceneWhenEditor {scene} />
      {:else}
        <SceneConditionsEditor {scene} />
      {/if}
    {/snippet}
  </Wizard>
{/if}
