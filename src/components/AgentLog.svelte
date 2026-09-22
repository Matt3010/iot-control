<script lang="ts">
  import { devices, type Agent, type LogEntry } from '../lib/devices.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Le ultime ventiquattr'ore di un agente.
   *
   * Non è un log di sistema: è quello che è successo in casa, scritto perché
   * lo legga una persona. La riga che serve davvero è «Tenda 1 ha smesso di
   * rispondere alle 3:14» — la mattina dopo, quando la trovi mezza aperta.
   *
   * Si apre chiedendolo: sono ventiquattr'ore di roba, e non è quello che
   * guardi entrando.
   */
  let { agent }: { agent: Agent } = $props();

  const open = $derived(!!devices.logs[agent.id]);
  const rows = $derived(devices.logs[agent.id] ?? []);

  function toggle() {
    if (open) devices.closeLog(agent.id);
    else void devices.openLog(agent.id);
  }

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
  function says(entry: LogEntry): { what: string; who: string } {
    const chi = entry.subject ?? '';
    switch (entry.kind) {
      /*
       * Queste tre parlano dell'agente stesso, e senza il suo nome davanti
       * sembravano parlare di una persona: «si è collegato» chi? In un
       * registro dove ogni altra riga comincia con un nome, una riga senza
       * soggetto se lo fa cercare a chi legge.
       */
      case 'up':
        return { what: 'si è collegato qui', who: agent.name };
      case 'down':
        return { what: 'si è scollegato', who: agent.name };
      case 'inventory':
        return { what: `vede qualcosa di diverso: ${entry.detail}`, who: agent.name };
      case 'device-up':
        return { what: 'ha ripreso a rispondere', who: chi };
      case 'device-down':
        return { what: 'ha smesso di rispondere', who: chi };
      case 'account':
        return { what: `${entry.detail}`, who: chi || 'Un account' };
      case 'scene':
        return { what: entry.ok ? `partita — ${entry.detail}` : `partita a metà — ${entry.detail}`, who: chi };
      default:
        return { what: entry.detail ?? '', who: chi };
    }
  }
</script>

<div class="log">
  <Button look="link" size="sm" onclick={toggle}>
    {open ? 'Chiudi il registro' : 'Registro delle ultime 24 ore'}
  </Button>

  {#if open}
    {#if rows.length}
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
  {/if}
</div>

<style>
  .log { display: grid; gap: 6px; min-width: 0; }

  ul {
    list-style: none;
    margin: 0;
    padding: 8px;
    display: grid;
    gap: 5px;
    max-height: 260px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: var(--r-md);
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
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
