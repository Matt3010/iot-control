<script lang="ts">
  import { devices, type Device, type Rule } from '../lib/devices.svelte';
  import { completa } from '../lib/chiedi';
  import { fraseDi, restaDa, SILENZIO, TACE } from '../lib/rules';
  import { store } from '../lib/store.svelte';
  import type { Column } from '../lib/table';
  import { Vista } from '../lib/vista.svelte';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import NoticeList from './NoticeList.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import PushSwitch from './PushSwitch.svelte';
  import Table from './Table.svelte';

  /**
   * Gli avvisi, in una pagina loro.
   *
   * Un avviso per riga, come gli avvisi avvenuti qui sotto: la stessa cosa
   * letta prima e dopo si legge allo stesso modo. Prima era un blocco per
   * dispositivo — una levetta, le sue regole, e un muro di pillole con tutte
   * le altre cose di casa — e cinque dispositivi facevano una pagina che non
   * finiva, dove per sapere cosa ti avvisa davvero bisognava leggerla tutta.
   */
  const rules = $derived(devices.rules);

  /** Su quale luogo sta, o almeno su quale agente. */
  function dove(device: Device): string {
    const agent = devices.agentOf(device);
    if (!agent) return '—';
    const luogo = store.places.find((place) => (place.agentIds ?? []).includes(agent.id));
    return luogo ? luogo.name : agent.name;
  }

  /**
   * Una riga per avviso.
   *
   * Il silenzio sta in fila con gli altri anche se dentro è un'altra cosa —
   * una levetta sul dispositivo invece di una regola scritta: chi guarda
   * vuole sapere cosa gli arriverà, non com'è fatto di dentro.
   */
  interface Riga {
    id: string;
    device: Device;
    quando: string;
    rule?: Rule;
    off: boolean;
  }

  /*
   * In che ordine, dall'intestazione della tabella. La vista sta qui e non con
   * le altre dell'app perché le righe sono fatte apposta per questa tabella:
   * una cosa con due regole ha due righe, e altrove non esistono.
   */
  const confronta = (a: string, b: string): number =>
    a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' });
  const vista = new Vista<Riga>({
    chiave: 'regole',
    criteri: [
      { id: 'cosa', label: 'Cosa', per: (a, b) => confronta(a.device.name, b.device.name) || confronta(a.quando, b.quando) },
      { id: 'quando', label: 'Ti avviso quando', per: (a, b) => confronta(a.quando, b.quando) || confronta(a.device.name, b.device.name) },
      { id: 'dove', label: 'Dove', per: (a, b) => confronta(dove(a.device), dove(b.device)) || confronta(a.device.name, b.device.name) },
    ],
  });

  const righe = $derived(
    vista.applica(
    devices.list
      .flatMap((device): Riga[] => [
        ...(device.watch ? [{ id: `tace:${device.id}`, device, quando: TACE, off: false }] : []),
        ...rules
          .filter((rule) => rule.deviceId === device.id)
          .map((rule) => ({
            id: rule.id,
            device,
            quando: fraseDi(device, rule.code, rule.becomes, rule.op) ?? rule.says,
            rule,
            off: !!rule.off,
          })),
      ]),
    ),
  );

  /*
   * Il luogo viene dopo la frase, non prima. Su un telefono la tabella scorre
   * di lato, e quello che si vede senza scorrere sono le prime due colonne:
   * il nome e cosa ti arriverà. Dove sta è la domanda dopo.
   */
  const COLONNE: Column[] = [
    { label: 'Cosa', width: 'fit', ordina: 'cosa' },
    // l'unica che ha da dire: lo spazio che avanza è suo
    { label: 'Ti avviso quando', ordina: 'quando' },
    { label: 'Dove', width: 'fit', ordina: 'dove' },
    { label: '', width: 'fit', align: 'end' },
  ];

  /**
   * Aggiungerne uno: prima quale cosa, poi cosa vuoi sapere.
   *
   * Due domande corte una dopo l'altra invece di un elenco di tutte le
   * combinazioni: una casa con venti dispositivi ne farebbe sessanta, e
   * cercare la propria in sessanta righe è più lungo che rispondere due
   * volte.
   */
  function aggiungi(event: MouseEvent): void {
    const tasto = event.currentTarget as HTMLElement;
    const libere = devices.list.filter((device) => restaDa(device, rules).length);
    ui.askPick(tasto, {
      title: 'Di quale cosa?',
      options: [...libere]
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
        .map((device) => ({ id: device.id, label: device.name, note: dove(device) })),
      onPick: (id: string) => chiedi(tasto, id),
    });
  }

  function chiedi(tasto: HTMLElement, deviceId: string): void {
    const device = devices.list.find((one) => one.id === deviceId);
    if (!device) return;
    ui.askPick(tasto, {
      title: `Cosa vuoi sapere di «${device.name}»?`,
      options: restaDa(device, rules),
      onPick: (scelto: string) => {
        if (scelto === SILENZIO) return void devices.watch(device, true);
        // l'ultimo passo è quello delle scene: subito, o dopo la soglia
        completa(device, scelto, 'quando', (prova) =>
          void devices.addRule(device.id, prova.code, String(prova.value), prova.op),
        );
      },
    });
  }

  function togli(riga: Riga): void {
    if (riga.rule) void devices.removeRule(riga.rule);
    else void devices.watch(riga.device, false);
  }
</script>

<PageShell
  title="Avvisi"
  layout="rows"
  lead="Le cose che vuoi sapere senza aprire l'app. Arrivano sulle macchine dove li hai accesi, e si spengono da qui."
>
  <PageCard>
    <PushSwitch />
  </PageCard>

  <PageCard wide>
    <div class="testa">
      <span class="eyebrow">Le cose che ti avvisano</span>
      <Button look="link" extra="pick-btn" disabled={!devices.list.length} onclick={aggiungi}>
        Aggiungi
      </Button>
    </div>

    <Table columns={COLONNE} rows={righe} {vista} label="Gli avvisi che hai chiesto">
      {#snippet row(riga: Riga)}
        <td class="chi fit" class:is-off={riga.off}>{riga.device.name}</td>
        <td class="quando" class:is-off={riga.off}>{riga.quando}</td>
        <td class="dove fit">{dove(riga.device)}</td>
        <td class="end fit">
          <span class="mani">
            {#if riga.rule}
              <!-- Sospendere vale solo per una regola: il silenzio è una
                   levetta sola, e spegnerla è già toglierlo. -->
              <Button
                look="icon"
                size="sm"
                extra="mano"
                title={riga.off ? 'Riaccendi questo avviso' : 'Sospendi questo avviso'}
                onclick={() => void devices.flipRule(riga.rule!, !riga.off)}
              >
                <Icon name={riga.off ? 'alertOff' : 'bell'} />
              </Button>
            {/if}
            <Button
              look="icon"
              size="sm"
              tone="danger"
              extra="mano kill"
              title="Togli questo avviso"
              onclick={() => togli(riga)}
            >
              <Icon name="trash" />
            </Button>
          </span>
        </td>
      {/snippet}

      {#snippet empty()}
        <p class="say">
          Non hai ancora chiesto niente. Da <b>Aggiungi</b> scegli una cosa di casa e cosa vuoi
          sapere di lei.
        </p>
      {/snippet}
    </Table>
  </PageCard>

  <PageCard wide>
    <NoticeList />
  </PageCard>
</PageShell>

<style>
  .say { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-2); }

  .say b { font-weight: 600; color: var(--ink); }

  /* il titolo della scheda e il tasto che ci aggiunge, sulla stessa riga */
  .testa {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .chi { font-weight: 560; color: var(--ink); }

  /* il luogo è un'informazione di contorno: si legge, non si urla */
  .dove { color: var(--ink-3); }

  .quando { color: var(--ink-2); }

  /* sospeso: resta scritto, ma si vede che adesso non dice niente */
  .is-off { opacity: 0.45; text-decoration: line-through; }

  /* i comandi si accendono quando ci passi sopra: da fermi sarebbero due
     icone per ogni riga, e le righe sono tante */
  .mani { display: inline-flex; gap: 2px; }

  .mani :global(.mano) { width: 24px; height: 24px; opacity: 0.4; transition: opacity 0.16s; }

  :global(tbody tr:hover) .mani :global(.mano), .mani :global(.mano:hover) { opacity: 1; }
</style>
