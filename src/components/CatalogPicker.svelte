<script lang="ts">
  import type { Agent } from '../lib/devices.svelte';
  import { nelRegistro, providerDa, PROVIDERS, type Provider } from '../lib/providers';
  import type { CatalogEntry, LinkedAccount } from '../lib/types';
  import AccountList from './AccountList.svelte';
  import SearchPicker from './SearchPicker.svelte';

  /**
   * Cosa è collegato a un agente, e tutto quello che gli si può collegare.
   *
   * In alto i collegamenti fatti, ognuno con il suo stato e «Scollega». Sotto
   * il catalogo intero, da cercare per nome: le marche del registro con i
   * nostri nomi — «Telecamera», non «Generic Camera» — e quelle che la
   * centrale ancora non ha, come eWeLink prima di installarlo. Una marca già
   * collegata non si ripropone, tranne quelle di cui se ne può avere più di
   * una, come le telecamere.
   *
   * `stato` è vivo: dopo uno «Scollega» la finestra si aggiorna da sola.
   */
  let {
    agent,
    stato,
    onpick,
    onoff,
    onricollega,
  }: {
    agent: Agent;
    stato: { linked: LinkedAccount[]; catalogo: CatalogEntry[]; busy: boolean };
    onpick: (provider: Provider) => void;
    onoff: (joint: LinkedAccount, label: string) => void;
    onricollega: (joint: LinkedAccount, account: Provider) => void;
  } = $props();

  // il nome del catalogo, o quello che l'agente manda con l'account per quelli che nel catalogo non ci sono
  const nome = (handler: string) =>
    stato.catalogo.find((voce) => voce.handler === handler)?.name ?? stato.linked.find((one) => one.handler === handler)?.name;

  const collegati = $derived(
    [...new Set(stato.linked.map((one) => one.handler))].map((handler) => providerDa(handler, nome(handler))),
  );

  const voci = $derived(
    [
      ...PROVIDERS.map((one) => ({ handler: one.handler, name: one.label })),
      ...stato.catalogo.filter((voce) => !nelRegistro(voce.handler)),
    ]
      .filter((voce) => providerDa(voce.handler).many || !stato.linked.some((one) => one.handler === voce.handler))
      .map((voce) => ({ id: voce.handler, name: voce.name })),
  );

  function scegli(handler: string): void {
    // la conversazione si apre sopra a questa finestra, e chiusa si torna qui
    onpick(providerDa(handler, voci.find((voce) => voce.id === handler)?.name));
  }
</script>

{#if collegati.length}
  <section class="collegati">
    <span class="eyebrow">Collegati</span>
    <AccountList {agent} accounts={collegati} linked={stato.linked} busy={stato.busy} {onoff} {onricollega} />
  </section>
  <span class="eyebrow">Da collegare</span>
{/if}

<SearchPicker
  {voci}
  chiave="catalogo"
  placeholder="Cerca una marca o un protocollo"
  vuoto="Nessuna marca con questo nome."
  onpick={scegli}
/>

<style>
  .collegati { display: grid; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--hairline-soft); }
</style>
