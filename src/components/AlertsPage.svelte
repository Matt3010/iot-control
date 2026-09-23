<script lang="ts">
  import NoticeList from './NoticeList.svelte';
  import PageCard from './PageCard.svelte';
  import PageShell from './PageShell.svelte';
  import PushSwitch from './PushSwitch.svelte';

  /**
   * Gli avvisi, in una pagina loro.
   *
   * Qui ci finirà l'elenco delle regole — «quando la porta si apre», «quando
   * scende sotto cinque gradi» — e già adesso c'è la cosa senza la quale
   * nessuna regola serve a niente: le notifiche accese su questa macchina.
   */
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
    <span class="eyebrow">Quando un agente tace</span>
    <p class="say">
      Se un agente sta zitto per un quarto d'ora te lo diciamo noi, senza che tu debba chiedere
      niente, e te lo diciamo di nuovo quando torna — con il nome del luogo dov'è installato. È
      l'unico avviso che può darti solo chi sta fuori casa tua, perché se è saltata la corrente
      di là non c'è più nessuno a parlare.
    </p>
    <p class="say quiet">
      Gli avvisi arrivano se c'è rete e se il telefono li accetta. Non è un sistema di sicurezza.
    </p>
  </PageCard>

  <PageCard wide>
    <NoticeList />
  </PageCard>
</PageShell>

<style>
  .say { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--ink-2); }

  /* la riga che mette le mani avanti: si legge, e non grida */
  .quiet { color: var(--ink-3); }
</style>
