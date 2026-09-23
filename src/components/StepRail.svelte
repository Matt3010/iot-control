<script lang="ts" generics="T extends { key: string; wait?: number; state?: 'live' | 'lost' | 'unknown'; says?: string; talk?: boolean }">
  import type { Snippet } from 'svelte';
  import { saysWait } from '../lib/timing';

  /**
   * Una sequenza letta dall'alto in basso.
   *
   * Le righe di una scena erano un elenco, e un elenco non dice se le cose
   * succedono insieme o una dopo l'altra: l'attesa scritta all'inizio della
   * riga sembrava una sua etichetta, non il tempo che passa prima. Qui il
   * tempo è la linea, e l'attesa è il pezzo di linea più lungo: si vede in un
   * colpo d'occhio dove la scena si ferma e riprende.
   *
   * Il pallino è lo stesso degli altri posti — verde risponde, rosso no,
   * grigio non si sa — perché un segno imparato una volta vale dappertutto.
   */
  let {
    steps,
    row,
  }: {
    steps: T[];
    /** Cosa c'è scritto su quella riga: il nome, l'azione, e i suoi comandi. */
    row: Snippet<[T, number]>;
  } = $props();
</script>

<ol class="rail">
  {#each steps as step, at (step.key)}
    {@const pausa = at > 0 ? step.wait : 0}
    <li class:is-first={at === 0} class:is-last={at === steps.length - 1}>
      {#if pausa}
        <!-- il tempo che passa: la linea si allunga e si spezza, e in mezzo
             c'è scritto quanto -->
        <span class="attesa">{saysWait(pausa)}</span>
      {/if}

      <!-- una riga che parla ha il suo nodo vuoto: non racconta come sta un
           dispositivo, perche' non ne tocca nessuno -->
      <span
        class="nodo is-{step.talk ? 'talk' : (step.state ?? 'live')}"
        role={step.says ? 'img' : undefined}
        aria-label={step.says}
        title={step.says}
      ></span>

      <div class="detto">{@render row(step, at)}</div>
    </li>
  {/each}
</ol>

<style>
  .rail {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }

  li {
    position: relative;
    display: grid;
    grid-template-columns: 13px 1fr;
    align-items: center;
    column-gap: 9px;
    padding: 3px 0;
  }

  /* la linea passa dietro ai pallini e si ferma al primo e all'ultimo, se no
     sembra che la scena cominci prima e continui dopo */
  li::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in srgb, var(--ink-3) 34%, transparent);
  }

  li.is-first::before { top: 50%; }

  li.is-last::before { bottom: 50%; }

  li.is-first.is-last::before { display: none; }

  .nodo {
    position: relative;
    width: 7px;
    height: 7px;
    margin-left: 3px;
    border-radius: 50%;
    background: var(--ok);
    /* il pallino sta sopra la linea e si porta dietro il suo alone, se no la
       linea gli passa attraverso */
    box-shadow: 0 0 0 3px rgb(var(--base));
  }

  .nodo.is-lost { background: var(--danger); }

  .nodo.is-unknown { background: var(--ink-3); opacity: 0.55; }

  .nodo.is-talk {
    background: rgb(var(--base));
    box-shadow: 0 0 0 3px rgb(var(--base)), inset 0 0 0 1.5px var(--accent);
  }

  .detto { min-width: 0; }

  /* l'attesa: una riga che apre spazio prima del nodo, con scritto quanto */
  .attesa {
    grid-column: 1 / -1;
    margin: 2px 0 2px 22px;
    padding: 1px 0;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }
</style>
