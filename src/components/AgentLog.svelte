<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { ui } from '../lib/ui.svelte';
  import AgentLogRows from './AgentLogRows.svelte';
  import Button from './Button.svelte';

  /**
   * Le ultime ventiquattr'ore di un agente.
   *
   * Non è un registro di sistema, è quello che è successo in casa, scritto
   * perché lo legga una persona. La riga che serve davvero è «Tenda 1 ha
   * smesso di rispondere alle 3:14», la mattina dopo, quando la trovi mezza
   * aperta.
   *
   * Si apre in una finestra e non qui sotto. Ventiquattr'ore di roba aperte
   * dentro alla scheda di un agente spingevano giù tutto quello che veniva
   * dopo, e chi leggeva perdeva il posto in cui stava; per vedere le righe
   * più vecchie si finiva a scorrere dentro a un riquadro alto duecento
   * pixel dentro a una pagina che scorreva anche lei.
   */
  let { agent }: { agent: Agent } = $props();

  function apri() {
    void devices.openLog(agent.id);
    ui.openModal({
      title: 'Registro delle ultime 24 ore',
      view: AgentLogRows,
      props: { agent },
      // chiusa la finestra, le righe non servono più a nessuno
      onclose: () => devices.closeLog(agent.id),
    });
  }
</script>

<div class="log">
  <Button look="link" size="sm" onclick={apri}>Registro delle ultime 24 ore</Button>
</div>

<style>
  /*
   * Una riga sua, e largo quanto la sua scritta.
   *
   * Dentro a una griglia il tasto si allargava da solo fino ai bordi della
   * scheda, e diventava una fascia appiccicata al fondo: sopra gli finiva
   * addosso l'ultimo dispositivo, sotto il bordo della scheda, e passandoci
   * il dito si accendeva tutto. Adesso e' una pastiglia in mezzo, staccata
   * da un filo come tutte le altre parti della scheda.
   */
  .log {
    display: flex;
    justify-content: center;
    min-width: 0;
    padding-top: 10px;
    border-top: 1px solid var(--hairline-soft);
  }
</style>
