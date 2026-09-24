<script lang="ts">
  import CopyLine from './CopyLine.svelte';

  /**
   * Il comando da incollare su quella macchina, con il tasto per copiarlo.
   *
   * Stava scritto due volte, nella pagina degli agenti e nella scheda di un
   * luogo, con due spiegazioni diverse sotto: una diceva anche perché su un
   * Mac serve una macchina virtuale, l'altra no.
   */
  let { install }: { install: string } = $props();
</script>

<div class="install">
  <span class="eyebrow">Da lanciare su quella macchina</span>
  <CopyLine text={install} title="Copia il comando" fallita="Copia non riuscita, il comando è quello che vedi" />
  <p class="once">
    Si vede una volta sola, perché dentro c'è il token e qui ne resta solo un'impronta.
    Vuole <b>Linux</b>, quindi su Windows incollala dentro WSL e su Mac dentro una macchina virtuale.
    Fuori di lì Docker non sta sulla rete di casa, e l'agente i dispositivi non li vedrebbe.
  </p>
</div>

<style>
  .install { display: grid; gap: 6px; min-width: 0; }

  .once { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }

  .once b { font-weight: 600; color: var(--ink-2); }
</style>
