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
  <!-- una riga sola, in fondo alla pagina: si legge di passaggio, come la
       barra di stato di un'app, e non ruba spazio alle schede -->
  <section class="banner" data-banner aria-label="Le prossime partenze automatiche">
    <!-- il fondo va da bordo a bordo, quello che dice sta in riga con le
         schede: sul grande la pagina è una colonna in mezzo -->
    <div class="dentro">
    <span class="eyebrow">Prossime</span>
    <ol class="tappe" data-fade="none" use:fadeEdges>
      {#each tappe as tappa, at (tappa.scene.id)}
        <li class="tappa" class:is-prima={at === 0}>
          <span class="punto" aria-hidden="true"></span>
          <b>{ora(tappa.at)}</b>
          <span class="giorno">{saysShortDay(tappa.at, auth.tz)}</span>
          <span class="nome">{tappa.scene.name}</span>
        </li>
      {/each}
    </ol>
    </div>
  </section>
{/if}

<style>
  /*
   * Un banner in fondo, fermo mentre le schede scorrono.
   *
   * Era una linea del tempo in cima, con i punti e il filo, alta quanto una
   * scheda: per una cosa che si guarda di passaggio era troppa. Qui è una
   * riga sola — l'ora, il giorno, il nome — e dice «cosa succede dopo» senza
   * chiedere attenzione.
   */
  .banner {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    padding: 9px max(20px, env(safe-area-inset-right)) calc(9px + env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
    background: var(--glass-strong);
    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
    border-top: 1px solid var(--hairline-soft);
  }

  .dentro {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 960px;
    margin: 0 auto;
  }

  .banner .eyebrow { flex: none; }

  .tappe {
    display: flex;
    align-items: center;
    gap: 18px;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-x: auto;
    scrollbar-width: none;
    white-space: nowrap;
  }

  .tappe::-webkit-scrollbar { display: none; }

  .tappa {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    font-size: 12px;
    color: var(--ink-3);
  }

  .punto {
    align-self: center;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
    opacity: 0.6;
  }

  /* la prossima si accende: è quella che succede per prima */
  .is-prima .punto { background: var(--accent); opacity: 1; }

  .tappa b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .nome { color: var(--ink-2); }
</style>
