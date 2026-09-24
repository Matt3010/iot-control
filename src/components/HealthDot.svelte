<script lang="ts">
  import type { Salute } from '../lib/health';

  /**
   * Il pallino che dice se un dispositivo risponde.
   *
   * Stava disegnato nella scheda del dispositivo e basta, e dove si sceglie
   * un dispositivo — per una scena, un avviso, una condizione — non c'era:
   * si sceglieva al buio una cosa che magari non risponde da ore. Un pezzo
   * solo, così i tre colori vogliono dire la stessa cosa ovunque.
   */
  let { salute }: { salute: Salute } = $props();
</script>

<span class="dot is-{salute.state}" role="img" aria-label={salute.says} title={salute.says}></span>

<style>
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
    transition: background 0.22s, box-shadow 0.22s;
  }

  /* non risponde: rosso, e dove conta accanto al nome ci finisce anche
     un'icona, perché il colore da solo non basta a chi non lo distingue */
  .dot.is-lost { background: var(--danger); }

  /* non si sa: l'agente non è collegato, e di qui non si vede niente */
  .dot.is-unknown {
    background: var(--ink-3);
    opacity: 0.55;
  }
</style>
