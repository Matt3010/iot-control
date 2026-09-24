<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import type { Scene } from '../lib/devices.svelte';
  import { fadeEdges } from '../lib/overflow';
  import { nextRun, saysShortDay } from '../lib/timing';

  /**
   * Le prossime partenze automatiche, in fila come avverranno.
   *
   * Le schede dicono di ogni scena quando parte, una per una. Quello che non
   * dicono è la giornata intera: cosa succede prima, cosa dopo, e se due
   * scene partono troppo vicine. Una linea sola, dalla più vicina alla più
   * lontana, risponde a colpo d'occhio.
   *
   * Solo le scene che partono da sole e hanno una prossima volta: quelle che
   * si premono a mano non stanno sul tempo, e mettercele sarebbe inventare
   * un orario. Se non ce n'è nessuna la linea non c'è.
   */
  let { scenes }: { scenes: Scene[] } = $props();

  /* il tempo passa anche a pagina aperta: una partenza delle 19:00 alle
     19:01 non è più la prossima */
  let adesso = $state(Date.now());
  $effect(() => {
    const battito = setInterval(() => (adesso = Date.now()), 30_000);
    return () => clearInterval(battito);
  });

  const tappe = $derived(
    scenes
      .map((scene) => ({ scene, at: nextRun(scene.when, auth.tz, new Date(adesso)) }))
      .filter((tappa): tappa is { scene: Scene; at: number } => tappa.at !== undefined)
      .sort((a, b) => a.at - b.at),
  );

  // le ore di casa, non quelle del browser: è a quest'ora che partirà
  const ora = (at: number): string =>
    new Date(at).toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit', timeZone: auth.tz });
</script>

{#if tappe.length}
  <section class="linea" aria-label="Le prossime partenze automatiche">
    <span class="eyebrow">Prossime partenze</span>
    <ol class="tappe" data-fade="none" use:fadeEdges>
      {#each tappe as tappa, at (tappa.scene.id)}
        <li class="tappa" class:is-prima={at === 0}>
          <span class="punto" aria-hidden="true"></span>
          <span class="quando">
            <b>{ora(tappa.at)}</b>
            {saysShortDay(tappa.at, auth.tz)}
          </span>
          <span class="nome">{tappa.scene.name}</span>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .linea {
    display: grid;
    gap: 10px;
    min-width: 0;
    /* sotto c'è già lo stacco della testata: uno in più farebbe un buco */
    margin-top: 6px;
  }

  /*
   * Una fila che scorre di lato, con il filo che passa sotto ai punti.
   *
   * Le tappe sono a distanza uguale e non in proporzione al tempo: la linea
   * dice l'ordine, e un'ora vuota fra due partenze non ha bisogno di mezzo
   * schermo per essere capita.
   */
  .tappe {
    position: relative;
    display: flex;
    gap: 28px;
    margin: 0 -4px;
    /* il bagliore del primo punto sporge di tre pixel: il riempimento gli fa
       posto, e il margine qui sopra rimette la linea in riga col titolo */
    padding: 4px 4px 2px;
    list-style: none;
    overflow-x: auto;
    scrollbar-width: none;
    /*
     * Il filo corre per tutta la riga, non solo da un punto all'altro: una
     * partenza sola restava un punto sospeso nel vuoto, e non si capiva che
     * fosse una linea del tempo. `local` lo fa scorrere insieme alle tappe
     * quando sono tante e la riga scorre di lato.
     */
    background: linear-gradient(var(--hairline), var(--hairline)) 0 8px / 100% 1px no-repeat local;
  }

  .tappe::-webkit-scrollbar { display: none; }

  .tappa {
    position: relative;
    flex: none;
    display: grid;
    gap: 3px;
    min-width: 96px;
    max-width: 180px;
    padding-top: 16px;
  }

  .punto {
    position: absolute;
    top: 0;
    left: 0;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--glass-strong);
    box-shadow: inset 0 0 0 1.5px var(--ink-3);
  }

  /* la prossima si accende: è quella che succede per prima */
  .is-prima .punto {
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .quando {
    font-size: 11px;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .quando b {
    margin-right: 4px;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .nome {
    font-size: 12.5px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
