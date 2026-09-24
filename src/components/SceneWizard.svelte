<script lang="ts">
  import { devices } from '../lib/devices.svelte';
  import { chiusura } from '../lib/fondo.svelte';
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
  // questa finestra e non quella davanti, che può essere una soglia chiesta da qui
  const chiudi = chiusura();
  $effect(() => {
    if (!scene) chiudi();
  });

  type Passo = { id: 'cosa' | 'quando' | 'se'; titolo: string };

  /*
   * «Solo se» c'è solo quando la scena parte da sola. Premuta a mano parte
   * sempre, e un passo che dice soltanto che non c'è niente da fare è un
   * clic in più per arrivare a «Fatto».
   */
  const passi = $derived<Passo[]>([
    { id: 'cosa', titolo: 'Cosa fa' },
    { id: 'quando', titolo: 'Quando' },
    ...(scene && ((scene.when && !scene.when.off) || (scene.triggers ?? []).length)
      ? [{ id: 'se' as const, titolo: 'Solo se' }]
      : []),
  ]);
</script>

{#if scene}
  <Wizard {passi} bind:passo onfine={() => undefined}>
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
