<script lang="ts">
  import { devices, type Scene } from '../lib/devices.svelte';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import SceneControls from './SceneControls.svelte';
  import SceneWizard from './SceneWizard.svelte';

  /**
   * Una scena, tutta in una scheda.
   *
   * Stavano tutte impilate dentro un riquadro solo, e non si capiva piu' dove
   * finisse una e cominciasse l'altra: il tasto che la fa partire, le sue
   * righe e il cestino sembravano tre elenchi paralleli invece che tre pezzi
   * della stessa cosa. Una scheda per scena, come per gli agenti.
   *
   * Dentro c'e' quello che si preme tutti i giorni. Scriverla — cosa fa,
   * quando parte, a quali condizioni — si fa una volta sola, e si fa in una
   * finestra a passi (`SceneWizard`) invece che in un pannello che si
   * allungava sotto la scheda con tre domande una sopra l'altra.
   */
  let { scene }: { scene: Scene } = $props();

  /** Cosa porta via eliminarla, che e' niente. I dispositivi restano dove sono. */
  const takesAway = (): string =>
    scene.steps.length
      ? 'I dispositivi restano dove sono. Se ne va solo quello che facevano insieme.'
      : 'È vuota e non porta via niente.';

  function modifica(): void {
    ui.openModal({ title: 'Modifica scena', view: SceneWizard, props: { sceneId: scene.id } });
  }
</script>

<SceneControls {scene}>
  {#snippet trail()}
    <Button look="icon" title="Modifica la scena" onclick={modifica}>
      <Icon name="edit" />
    </Button>
    <Button
      look="icon"
      tone="danger"
      extra="kill"
      title="Elimina scena"
      onclick={(event: MouseEvent) =>
        ui.askSure(event.currentTarget as HTMLElement, {
          title: `Eliminare “${scene.name}”?`,
          detail: takesAway(),
          verb: 'Elimina',
          onYes: () => void devices.removeScene(scene),
        })}
    >
      <Icon name="trash" />
    </Button>
  {/snippet}
</SceneControls>
