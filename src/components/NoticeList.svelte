<script lang="ts">
  import { untrack } from 'svelte';
  import { alerts, type Notice } from '../lib/alerts.svelte';
  import { devices } from '../lib/devices.svelte';
  import Pager from './Pager.svelte';
  import type { Column } from '../lib/table';
  import Table from './Table.svelte';

  /**
   * Gli avvisi avvenuti, dal più recente.
   *
   * A righe e non a schede: ognuno dice tre cose — quando, quale posto, cosa
   * — e cinque schede alte mezza pagina per quindici parole l'una sono un
   * elenco che non si scorre. In colonna si legge dall'alto e le ore si
   * incolonnano da sole.
   *
   * La colonna della consegna non è pignoleria: una notifica può essere
   * respinta, e questa pagina è l'unico posto dove un avviso che non è
   * arrivato esiste lo stesso.
   */
  // si rilegge dalla prima pagina anche quando cambia l'ordine: la terza
  // pagina di un altro ordine è un'altra fetta di elenco
  $effect(() => {
    void alerts.vista.richiesta;
    untrack(() => void alerts.load(0));
  });

  /*
   * «Chi» e non «agente»: qui ci finisce anche il nome di una scena o di un
   * dispositivo, e chiamarli agente era dire una cosa falsa su due righe su
   * tre. Il luogo resta una colonna a parte perché è un'altra domanda — chi
   * lo dice, e dove — e chi lo dice può non stare da nessuna parte.
   */
  const COLONNE: Column[] = [
    { label: 'Quando', width: 'fit', ordina: 'quando' },
    { label: 'Chi', width: 'fit', ordina: 'chi' },
    { label: 'Luogo', width: 'fit', ordina: 'luogo' },
    // l'unica che ha da dire: lo spazio che avanza è suo
    { label: 'Cosa', ordina: 'cosa' },
    { label: 'Consegna', width: 'fit', align: 'end', ordina: 'consegna' },
  ];

  /**
   * Chi, con davanti che cosa è.
   *
   * Un nome da solo non basta. «Casa» può essere un agente o una scena, e
   * «Test» pure, e chi legge doveva ricordarsi come aveva chiamato cosa. Per
   * un dispositivo si scrive anche l'agente che l'ha trovato, perché
   * «192.168.1.44/video1» da solo non dice in quale casa stia.
   *
   * L'agente di un dispositivo si cerca fra quelli che ci sono adesso: se nel
   * frattempo è stato eliminato resta il dispositivo da solo, che è meglio di
   * un nome inventato.
   */
  function chi(row: Notice): { tipo: string; nome: string }[] {
    const nome = row.who ?? '—';
    if (row.kind === 'scene') return [{ tipo: 'Scena', nome }];
    const agente = devices.agents.find((agent) => agent.id === row.agentId)?.name;
    // un account è di un agente, e senza l'agente non si sa quale casa ha perso l'accesso
    if (row.kind === 'account') return [...(agente ? [{ tipo: 'Agente', nome: agente }] : []), { tipo: 'Account', nome }];
    if (!row.deviceId) return [{ tipo: 'Agente', nome }];

    return [
      ...(agente ? [{ tipo: 'Agente', nome: agente }] : []),
      { tipo: 'Dispositivo', nome },
    ];
  }

  /** Che ora era. Oggi basta l'ora; prima serve dire anche il giorno. */
  function when(at: string): string {
    const then = new Date(at);
    const ore = then.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });
    const oggi = new Date().toDateString() === then.toDateString();
    if (oggi) return ore;

    const ieri = new Date();
    ieri.setDate(ieri.getDate() - 1);
    if (ieri.toDateString() === then.toDateString()) return `ieri ${ore}`;

    return `${then.toLocaleDateString('it', { day: 'numeric', month: 'short' })}, ${ore}`;
  }

  /**
   * Com'è andata la consegna, in due parole.
   *
   * «Macchine» e non «telefoni»: un'iscrizione è un browser su una macchina, e
   * fra le tre che ricevono qui dentro ce n'è una che è un Mac. È anche la
   * parola che usa la levetta — «mandameli su questa macchina» — e due nomi
   * per la stessa cosa fanno chiedere se siano due cose.
   */
  function delivery(row: Notice): { what: string; bad: boolean } {
    if (row.failed && !row.sent) return { what: 'respinto', bad: true };
    if (row.failed) return { what: `${row.sent} sì, ${row.failed} no`, bad: true };
    if (!row.sent) return { what: 'nessuna macchina', bad: false };
    return { what: row.sent === 1 ? 'consegnato' : `${row.sent} macchine`, bad: false };
  }
</script>

<div class="avvenuti">
  <span class="eyebrow">Ultimi avvisi</span>

  {#if !alerts.loaded}
    <!-- prima di sapere non si dice niente: «non è successo niente» detto
         mentre si sta ancora chiedendo è una bugia che dura un secondo -->
    <p class="say">Un momento…</p>
  {:else}
    <Table columns={COLONNE} rows={alerts.rows} vista={alerts.vista} label="Gli avvisi avvenuti">
      {#snippet row(one: Notice)}
        {@const esito = delivery(one)}
        <td class="quando fit">{when(one.at)}</td>
        <td class="chi fit">
          <!-- il pallino, come sui luoghi e sugli agenti: giallo quando c'e'
               qualcosa che non va, verde quando e' rientrato -->
          <span class="segno" class:is-back={one.kind === 'back'} class:is-scene={one.kind === 'scene'}></span>
          {#each chi(one) as pezzo, at (at)}
            {#if at}<span class="sep">/</span>{/if}
            <span class="tipo">{pezzo.tipo}</span><span class="sep">/</span>{pezzo.nome}
          {/each}
        </td>
        <td class="dove fit">{one.where ?? 'nessun luogo'}</td>
        <td>{one.short ?? one.title}</td>
        <td class="end fit">
          <span class="esito" class:male={esito.bad}>{esito.what}</span>
        </td>
      {/snippet}

      {#snippet foot()}
        <Pager
          total={alerts.total}
          offset={alerts.offset}
          limit={alerts.limit}
          busy={alerts.busy}
          what="avvisi"
          onpick={(offset: number) => void alerts.load(offset)}
        />
      {/snippet}

      {#snippet empty()}
        <p class="say">
          Non è ancora successo niente. Quando un agente smetterà di rispondere lo troverai scritto
          qui, anche se la notifica non fosse arrivata.
        </p>
      {/snippet}
    </Table>
  {/if}
</div>

<style>
  .avvenuti { display: grid; gap: 9px; min-width: 0; }

  .say { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-3); }

  .quando { color: var(--ink-3); }

  .chi { font-weight: 560; color: var(--ink); }

  /* il tipo e le barre si leggono di passaggio, il nome è quello che si cerca */
  .tipo { font-weight: 450; color: var(--ink-3); }

  .sep { margin: 0 5px; font-weight: 400; color: var(--ink-3); opacity: 0.6; }

  /* il luogo è un'informazione di contorno: si legge, non si urla */
  .dove { color: var(--ink-3); }

  .segno {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 7px;
    vertical-align: 1px;
    border-radius: 50%;
    background: var(--warn);
  }

  /* il ritorno non è un allarme: stesso posto, colore diverso */
  .segno.is-back { background: var(--ok); }

  /* e nemmeno il messaggio di una scena, che hai scritto tu: grigio, come
     una cosa detta e non una cosa successa */
  .segno.is-scene { background: var(--ink-3); }

  /* l'esito è un dato, non una frase: sta in una pastiglia e non compete con
     quello che l'avviso diceva */
  .esito {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 99px;
    background: var(--sunken-hover);
    font-size: 10.5px;
    letter-spacing: 0.005em;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .esito.male {
    background: color-mix(in oklab, var(--warn) 16%, transparent);
    color: var(--warn);
  }
</style>
