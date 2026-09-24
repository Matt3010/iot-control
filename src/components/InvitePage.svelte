<script lang="ts">
  import { api } from '../lib/api';
  import { auth } from '../lib/auth.svelte';
  import Alert from './Alert.svelte';
  import Button from './Button.svelte';
  import Gate from './Gate.svelte';
  import Icon from './Icon.svelte';
  import LoginScreen from './LoginScreen.svelte';

  /**
   * Chi apre un link d'invito arriva qui.
   *
   * Esiste perché chi riceve un link di solito non è ancora entrato, e a
   * volte non ha nemmeno un accesso: la pagina gli dice subito chi lo invita
   * e su quale mappa, lo fa entrare o iscrivere con la porta di sempre, e
   * appena è dentro accetta da sola, perché era quello che voleva fare
   * aprendo il link. Chi era già entrato preme un tasto solo: potrebbe
   * essere entrato con un altro account, ed è meglio che lo veda scritto.
   */
  let { code }: { code: string } = $props();

  interface Look {
    stato: 'aperto' | 'usato' | 'scaduto' | 'revocato';
    detto?: string;
    mapName: string;
    ownerHandle: string;
  }

  let look = $state<Look | null>(null);
  let problema = $state('');
  let working = $state(false);
  /** Se è passato dalla porta di questa pagina: allora l'invito si accetta da solo. */
  let entratoQui = false;

  $effect(() => {
    void api
      .get<Look>(`/invites/${code}`)
      .then((letto) => (look = letto))
      .catch((error: Error) => (problema = error.message));
  });

  async function accetta() {
    working = true;
    problema = '';
    try {
      await auth.acceptInvite(code);
    } catch (error) {
      problema = (error as Error).message;
      working = false;
    }
  }

  $effect(() => {
    if (look?.stato !== 'aperto') return;
    if (!auth.account) entratoQui = true;
    else if (entratoQui) {
      entratoQui = false;
      void accetta();
    }
  });
</script>

{#snippet via(label: string)}
  <Button look="primary" extra="go" href="/">{label}<Icon name="submit" /></Button>
{/snippet}

{#if !look && problema}
  {#snippet perche()}{problema}{/snippet}
  <Gate title="Questo link d’invito non si apre" lead={perche}>
    {@render via(auth.account ? 'Vai alla tua mappa' : 'Entra')}
  </Gate>
{:else if !look}
  <!-- un istante di niente, come per l'ingresso: meglio che un lampo della pagina sbagliata -->
{:else if look.stato !== 'aperto'}
  {#snippet perche()}{look?.detto}{/snippet}
  <Gate title="Questo link d’invito non vale più" lead={perche}>
    {@render via(auth.account ? 'Vai alla tua mappa' : 'Entra')}
  </Gate>
{:else if !auth.account}
  <LoginScreen invito={look} />
{:else}
  {#snippet chi()}
    <b>@{look?.ownerHandle}</b> ti apre la mappa «{look?.mapName}». Entri come <b>@{auth.account?.handle}</b>,
    e ci lavori come nelle tue.
  {/snippet}
  <Gate title="Ti hanno invitato su una mappa" lead={chi}>
    {#if problema}<Alert message={problema} />{/if}
    <Button look="primary" extra="go" disabled={working} onclick={() => void accetta()}>
      {working ? 'Un attimo…' : 'Entra nella mappa'}
      <Icon name="submit" />
    </Button>
    <p class="foot"><a href="/">Non adesso, torna alla tua mappa</a></p>
  </Gate>
{/if}

<style>
  .foot {
    margin: -8px 0 0;
    font-size: 12px;
    color: var(--ink-3);
    text-align: center;
  }

  .foot a { color: var(--ink); font-weight: 560; text-underline-offset: 2px; }
</style>
