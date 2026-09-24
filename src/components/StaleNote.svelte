<script lang="ts">
  import { devices } from '../lib/devices.svelte';

  /*
   * Quando l'ultima rilettura di agenti, dispositivi e scene non è arrivata.
   *
   * Quello che c'era resta sullo schermo, perché è vecchio e non sbagliato:
   * svuotarlo faceva sparire le scene da sotto a chi le scriveva. Ma chi
   * guarda deve sapere che non è fresco, e perché, se no crede a un elenco
   * che nel frattempo è cambiato.
   */
</script>

{#if devices.loadError}
  <p class="stale" role="status">
    {#if devices.letto}
      Quello che vedi è dell’ultima lettura riuscita, perché agenti, dispositivi e scene non si rileggono
      ({devices.loadError}).
    {:else}
      Agenti, dispositivi e scene non si vedono perché la prima lettura non è riuscita
      ({devices.loadError}). Ricaricando la pagina si riprova.
    {/if}
  </p>
{/if}

<style>
  .stale {
    margin: 0;
    max-width: 62ch;
    font-size: 12px;
    line-height: 1.45;
    color: var(--warn);
  }
</style>
