<script lang="ts">
  import { devices } from '../lib/devices.svelte';
  import AgentControls from './AgentControls.svelte';

  /**
   * Gli agenti di un luogo, uno sotto l'altro e solo da guardare. Serve al
   * popup sulla mappa, che di Svelte non sa niente e vuole un componente solo
   * da montare — e a tenere fuori dal popup i comandi che appartengono alla
   * scheda: lì si accende, non si riconfigura.
   */
  let { agentIds }: { agentIds: string[] } = $props();

  const mine = $derived(
    agentIds.map((id) => devices.agents.find((agent) => agent.id === id)).filter((agent) => !!agent),
  );
</script>

<div class="stack">
  {#each mine as agent (agent.id)}
    <AgentControls {agent} />
  {/each}
</div>

<style>
  .stack { display: grid; gap: 8px; }
</style>
