<script lang="ts">
  import { devices, type Agent, type LogEntry } from '../lib/devices.svelte';
  import Icon from './Icon.svelte';

  /**
   * Le righe delle ultime ventiquattr'ore, e basta.
   *
   * Non sa dove viene disegnato — dentro a una finestra, oggi; domani in
   * fondo alla scheda di un agente, se servirà — e per questo non si porta
   * dietro né un titolo né un modo di chiudersi. Chiede lui le righe quando
   * nasce, perché chi lo mette da qualche parte non debba sapere che vanno
   * chieste.
   */
  let { agent }: { agent: Agent } = $props();

  const rows = $derived(devices.logs[agent.id] ?? []);
  const chiesto = $derived(agent.id in devices.logs);

  /** Che ora era. Oggi basta l'ora; ieri serve dire che era ieri. */
  function when(at: string): string {
    const then = new Date(at);
    const ore = then.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });
    const oggi = new Date().toDateString() === then.toDateString();
    return oggi ? ore : `ieri ${ore}`;
  }

  /**
   * La riga, in italiano. Il soggetto davanti quando c'è — «Tenda 1» — perché
   * un registro si scorre cercando un nome, non un tipo di evento.
   */
  /**
   * Le righe vecchie dicevano solo «collegato», e il verbo si mette qui.
   *
   * Al presente, e non al passato: «collegato» si accorda con chi lo
   * precede, e chi lo precede è un nome che hai scelto tu — «Telecamera è
   * stato collegato» è sbagliato, e non c'è modo di sapere il genere di una
   * parola qualsiasi. «Si collega» vale per tutti.
   */
  const legge = (detail: string | undefined): string =>
    detail === 'collegato' || detail === 'è stato collegato'
      ? 'si collega'
      : detail === 'scollegato' || detail === 'è stato scollegato'
        ? 'si scollega'
        : (detail ?? '');

  /** Le righe vecchie dicevano solo «6 dispositivi»: il verbo si mette qui. */
  const conta = (detail: string | undefined, ok: boolean | undefined): string => {
    const detto = detail ?? '';
    if (detto.startsWith('parte') || detto.startsWith('non parte')) return detto;
    return ok ? `parte — ${detto}` : `parte a metà — ${detto}`;
  };

  function says(entry: LogEntry): { what: string; who: string } {
    const chi = entry.subject ?? '';
    switch (entry.kind) {
      /*
       * Queste tre parlano dell'agente stesso, e senza il suo nome davanti
       * sembravano parlare di una persona: «si è collegato» chi? In un
       * registro dove ogni altra riga comincia con un nome, una riga senza
       * soggetto se lo fa cercare a chi legge.
       */
      /*
       * Al presente, per la stessa ragione: «Casa si è collegato» ha il genere
       * sbagliato e «collegata» ce l'ha per metà degli altri nomi. In un
       * registro con l'ora davanti il presente si legge bene lo stesso.
       */
      case 'up':
        return { what: 'si collega', who: agent.name };
      case 'down':
        return { what: 'si scollega', who: agent.name };
      case 'inventory':
        return { what: entry.detail ?? '', who: agent.name };
      case 'device-up':
        return { what: 'ha ripreso a rispondere', who: chi };
      case 'device-down':
        return { what: 'ha smesso di rispondere', who: chi };
      /*
       * Il verbo lo mette la riga, non il server: le righe di ieri dicevano
       * solo «collegato», e un registro non si riscrive per cambiare una
       * parola — si legge come si legge oggi.
       */
      case 'account':
        return { what: legge(entry.detail), who: chi || 'Un account' };
      /*
       * La frase la scrive chi ha contato: quante righe sono partite, quante
       * no, e se non è partito niente. Le righe di ieri portavano solo il
       * conteggio, e per quelle il verbo si mette ancora qui.
       */
      case 'scene':
        return { what: conta(entry.detail, entry.ok), who: chi };
      /*
       * Il comando e non il risultato: qui ci finisce anche quello che non è
       * riuscito, e scrivere «acceso» di una cosa che non si è accesa sarebbe
       * il modo più veloce per rendere il registro inutile.
       */
      case 'command':
        return {
          what: entry.ok === false ? `non ha eseguito «${entry.detail}»` : `ha eseguito «${entry.detail}»`,
          who: chi,
        };
      default:
        return { what: entry.detail ?? '', who: chi };
    }
  }
</script>

{#if !chiesto}
  <p class="none">Sto leggendo il registro…</p>
{:else if rows.length}
  <ul>
    {#each rows as entry (entry.id)}
      {@const line = says(entry)}
      <li class:is-bad={entry.ok === false}>
        <span class="at">{when(entry.at)}</span>
        <span class="what">
          {#if line.who}<b>{line.who}</b>{/if}
          {line.what}
          {#if entry.ok === false}<Icon name="alert" />{/if}
        </span>
        {#if entry.who}<span class="hand" title={entry.who}>{entry.who.split('@')[0]}</span>{/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="none">Nelle ultime ventiquattr’ore non è successo niente.</p>
{/if}

<style>
  /* Righe e basta, senza un riquadro intorno e senza un'altezza massima.
     Il riquadro lo mette chi ci disegna dentro — oggi una finestra, che ha
     già il suo bordo — e l'altezza la decide lui, che sa quanto spazio ha.
     Un elenco che scorre dentro a una pagina che scorre è un elenco in cui
     non si riesce a scendere. */
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink-3);
  }

  /* l'ora ha una colonna sua: un registro si scorre con l'occhio a sinistra */
  .at {
    flex: none;
    width: 52px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-3);
    opacity: 0.75;
  }

  .what { flex: 1; min-width: 0; color: var(--ink-2); }

  .what b { font-weight: 600; color: var(--ink); }

  .what :global(.ico) { width: 12px; height: 12px; vertical-align: -1px; color: var(--danger); }

  li.is-bad .what { color: var(--ink-2); }

  /* chi ha premuto: smorzato, perché quasi sempre sei tu */
  .hand {
    flex: none;
    max-width: 90px;
    font-size: 10.5px;
    color: var(--ink-3);
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .none { margin: 0; font-size: 11.5px; color: var(--ink-3); }
</style>
