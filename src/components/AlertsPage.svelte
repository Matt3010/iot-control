<script lang="ts">
  import { devices, type Device } from '../lib/devices.svelte';
  import { store } from '../lib/store.svelte';
  import Chip from './Chip.svelte';
  import DeviceAlerts from './DeviceAlerts.svelte';
  import NoticeList from './NoticeList.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import PushSwitch from './PushSwitch.svelte';

  /**
   * Gli avvisi, in una pagina loro.
   *
   * Qui c'è l'elenco delle regole — «quando la porta si apre», «quando smette
   * di rispondere» — e la cosa senza la quale nessuna regola serve a niente:
   * le notifiche accese su questa macchina.
   *
   * Stavano sulla riga di ogni dispositivo, dentro la scheda del suo agente.
   * Là si va per accendere e per aprire, e ogni riga portava dietro una
   * campana e una sezione che quasi sempre restava chiusa: venti cose
   * attaccate facevano venti campane per una decisione che si prende una
   * volta sola. E per sapere cosa fosse sorvegliato bisognava aprirle tutte.
   */
  const dove = (device: Device): string | undefined => {
    const agent = devices.agentOf(device);
    if (!agent) return undefined;
    const luogo = store.places.find((place) => (place.agentIds ?? []).includes(agent.id));
    return luogo ? `Su «${luogo.name}»` : `Agente «${agent.name}»`;
  };

  const ordinate = (list: Device[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, 'it'));

  /** Quelle che dicono già qualcosa: la levetta accesa, o una regola scritta. */
  const sorvegliate = $derived(
    ordinate(devices.list.filter((device) => device.watch || devices.rulesOf(device.id).length)),
  );

  /**
   * Quelle aperte a mano, che ancora non dicono niente.
   *
   * Finché non si accende la levetta o non si preme una scelta, il server non
   * sa niente di questa cosa: l'elenco qui sopra la mostrerebbe solo dopo. È
   * questo a tenerla sullo schermo il tempo di decidere.
   */
  let aperte = $state<string[]>([]);

  /**
   * Le altre, raccolte sotto il posto dove stanno.
   *
   * Due case hanno tutt'e due una «Mansarda», e un elenco di nomi soli
   * costringerebbe a indovinare quale. Il gruppo lo dice una volta per tutte
   * invece di ripeterlo su ogni nome.
   */
  const altre = $derived(
    Object.values(
      ordinate(
        devices.list.filter(
          (device) => !device.watch && !devices.rulesOf(device.id).length && !aperte.includes(device.id),
        ),
      ).reduce<Record<string, { dove: string; cose: Device[] }>>((gruppi, device) => {
        const qui = dove(device) ?? 'Senza agente';
        (gruppi[qui] ??= { dove: qui, cose: [] }).cose.push(device);
        return gruppi;
      }, {}),
    ),
  );

  const mostrate = $derived([
    ...sorvegliate,
    ...ordinate(devices.list.filter((device) => aperte.includes(device.id) && !device.watch && !devices.rulesOf(device.id).length)),
  ]);
</script>

<PageShell
  title="Avvisi"
  layout="rows"
  lead="Le cose che vuoi sapere senza aprire l'app, come un agente che smette di rispondere, una porta che resta aperta, una stanza che va sotto zero. Arrivano sul telefono, e li spegni da qui quando non li vuoi più."
>
  <PageCard>
    <PushSwitch />
  </PageCard>

  <PageCard>
    <span class="eyebrow">Quando un agente smette di rispondere</span>
    <p class="say">
      Se un agente non si fa vivo per un quarto d'ora te lo diciamo noi, senza che tu debba
      chiedere niente, e te lo diciamo di nuovo quando riprende, con il nome del luogo dov'è
      installato. È l'unico avviso che può darti solo chi sta fuori casa tua, perché se è saltata
      la corrente di là non c'è più nessuno a segnalarlo.
    </p>
    <p class="say quiet">
      Gli avvisi arrivano se c'è rete e se il telefono li accetta. Non è un sistema di sicurezza.
    </p>
  </PageCard>

  <PageCard wide>
    <span class="eyebrow">Le cose che ti avvisano</span>

    {#if mostrate.length}
      <ul class="cose">
        {#each mostrate as device (device.id)}
          {@const qui = dove(device)}
          <li class="cosa">
            <div class="chi">
              <span class="nome">{device.name}</span>
              {#if qui}<span class="qui">{qui}</span>{/if}
            </div>
            <DeviceAlerts {device} />
          </li>
        {/each}
      </ul>
    {:else}
      <p class="say">
        Non ne sorvegli nessuna. Scegline una qui sotto e dì cosa vuoi sapere.
      </p>
    {/if}

    {#if altre.length}
      <!-- L'elenco per esteso e non una domanda che si apre: su un telefono
           un foglietto che compare in cima allo schermo è lontano dalla cosa
           di cui parla, e qui i nomi si leggono tutti insieme. -->
      <div class="altre">
        <span class="eyebrow">Un'altra cosa da sorvegliare</span>
        {#each altre as gruppo (gruppo.dove)}
          <div class="gruppo">
            <span class="qui">{gruppo.dove}</span>
            <div class="nomi">
              {#each gruppo.cose as device (device.id)}
                <Chip
                  label={device.name}
                  size="sm"
                  look="off"
                  onclick={() => (aperte = [...aperte, device.id])}
                />
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else if !devices.list.length}
      <p class="say quiet">
        Nessun dispositivo, per ora. Compaiono qui appena un agente li racconta.
      </p>
    {/if}
  </PageCard>

  <PageCard wide>
    <NoticeList />
  </PageCard>
</PageShell>

<style>
  .say { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-2); }

  /* la riga che mette le mani avanti: si legge, e non grida */
  .quiet { color: var(--ink-3); }

  .cose { list-style: none; margin: 0; padding: 0; display: grid; }

  /* Una riga per cosa, divisa dalla successiva come i dispositivi dentro la
     scheda di un agente: la stessa cosa si divide allo stesso modo. */
  .cosa { display: grid; gap: 9px; padding: 11px 0; }

  .cosa + .cosa { border-top: 1px solid var(--hairline-soft); }

  .chi { display: flex; align-items: baseline; gap: 9px; min-width: 0; }

  .nome {
    font-size: 12.5px;
    font-weight: 560;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* dove sta, perché due case possono avere tutt'e due una «Tenda soggiorno» */
  .qui { flex: none; font-size: 11px; color: var(--ink-3); }

  .altre { display: grid; gap: 8px; margin-top: 4px; }

  .gruppo { display: grid; gap: 5px; }

  .nomi { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
