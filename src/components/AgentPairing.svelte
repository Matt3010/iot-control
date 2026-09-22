<script lang="ts">
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { LinkedAccount, PairingStep } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Button from './Button.svelte';
  import Switch from './Switch.svelte';
  import Qr from './Qr.svelte';

  /**
   * Collegare un account senza uscire da qui.
   *
   * Ogni marca ha il suo rito — Tuya vuole un codice e poi un QR, eWeLink
   * email e password — ma il dialogo è lo stesso: Home Assistant dice cosa
   * chiedere, noi lo chiediamo, e quando c'è un QR lo disegniamo.
   *
   * eWeLink Home Assistant non ce l'ha di serie: se lo scegli, l'agente se lo
   * installa al momento. Non prima: nessuno scarica roba di terzi su una
   * macchina per un account che non userà mai.
   */
  let { agent }: { agent: Agent } = $props();

  /**
   * Cosa si può collegare, e cosa comporta collegarlo. Il secondo non è un
   * dettaglio: aggiungere eWeLink scarica un'integrazione di terze parti su
   * quella macchina e fa riavviare Home Assistant, e chi preme deve saperlo
   * prima, non dopo.
   */
  /*
   * Nei testi non si nomina mai cosa gira dentro l'agente. Chi guarda questa
   * pagina non deve sapere che la' sotto c'e' Home Assistant: per lui c'e'
   * l'agente, che sta in un posto e collega le cose. Anche gli errori che
   * salgono da laggiu' parlano cosi' — il nome vero resta nel registro della
   * macchina, che e' dove serve.
   */
  const ACCOUNTS = [
    {
      handler: 'tuya',
      label: 'Tuya',
      warns: "Ti verrà chiesto il codice che sta nell'app Smart Life, e poi un QR da inquadrare.",
    },
    {
      handler: 'sonoff',
      label: 'eWeLink',
      warns:
        "La prima volta l'agente aggiunge il supporto eWeLink e si riavvia: ci vuole un minuto. Poi ti chiederà le credenziali dell'app.",
    },
    {
      handler: 'generic',
      label: 'Telecamera',
      warns:
        "Ti chiederà l'indirizzo del flusso — di solito una riga che comincia per rtsp:// — e come raggiungerlo. Una telecamera per volta: se il registratore ne ha quattro, si fa quattro volte.",
    },
  ] as const;

  /** Come si chiamano i campi di HA, detto in italiano. */
  const LABELS: Record<string, string> = {
    still_image_url: 'Indirizzo di un fermo immagine',
    stream_source: 'Indirizzo del flusso',
    rtsp_transport: 'Come raggiungerlo',
    authentication: 'Tipo di autenticazione',
    framerate: 'Fotogrammi al secondo',
    verify_ssl: 'Controlla il certificato',
    limit_refetch_to_url_change: "Rileggi solo se cambia l'indirizzo",
    use_wallclock_as_timestamps: "Usa l'ora del computer",
    content_type: 'Tipo di contenuto',
    user_code: 'Codice utente',
    country_code: "Paese dell'account",
    password: 'Password',
    email: 'Email',
    host: 'Indirizzo',
  };

  /**
   * Gli stessi nomi, detti diversamente a seconda di chi li chiede.
   *
   * `username` per eWeLink e' l'email con cui entri nell'app; per una
   * telecamera e' l'utente che *quella telecamera* chiede, se lo chiede — e
   * quasi sempre non lo chiede. Chiamarlo «email» davanti a una telecamera fa
   * credere che serva la tua, e la tua li' dentro non c'entra niente.
   */
  const PER_MARCA: Record<string, Record<string, string>> = {
    sonoff: { username: 'Email o numero di telefono' },
    generic: { username: 'Utente della telecamera', password: 'Password della telecamera' },
  };

  const named = (name: string) =>
    PER_MARCA[handler]?.[name] ?? LABELS[name] ?? name.replace(/_/g, ' ');

  /**
   * Il paese non dice «questo è un telefono»: dice **su quale server** sta il
   * tuo account — Europa, America, Asia, Cina. Senza, eWeLink va di default
   * sul server cinese e l'accesso fallisce senza spiegare perché.
   *
   * Quindi non si chiede: si indovina da dove sei, e resta lì da correggere
   * se l'account è di un altro paese. Il nome del paese lo sa il browser.
   */
  function guessCountry(options: { value: string; label: string }[]): string {
    try {
      const region = new Intl.Locale(navigator.language).region;
      if (!region) return '';
      const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
      return options.find((option) => option.label.startsWith(`${name} `))?.value ?? '';
    } catch {
      return '';
    }
  }

  /** Alla comparsa del campo si propone il paese di chi sta guardando. */
  $effect(() => {
    const country = step?.fields.find((field) => field.name === 'country_code');
    if (!country?.options || answers.country_code) return;
    const guess = guessCountry(country.options);
    if (guess) answers = { ...answers, country_code: guess };
  });

  /** Cosa è già collegato: si chiede una volta, e si riaggiorna quando cambia. */
  let linked = $state<LinkedAccount[]>([]);
  const joined = (handler: string) => linked.find((one) => one.handler === handler);

  $effect(() => {
    if (!agent.online) return;
    void devices
      .linked(agent)
      .then((list) => (linked = list))
      .catch(() => undefined);
  });

  let step = $state<PairingStep | null>(null);
  let handler = $state<string>('tuya');
  let busy = $state(false);
  /** Quello che la persona sta scrivendo, per nome del campo. */
  let answers = $state<Record<string, string | boolean>>({});

  /**
   * Quali campi la persona ha davvero toccato.
   *
   * Finché non li tocca restano in sola lettura, e un campo in sola lettura il
   * browser non lo riempie. Sembra un cavillo e non lo è: questo modulo chiede
   * «utente» e «password» perché certe telecamere li vogliono, e il gestore
   * password ci infilava dentro le credenziali del tuo account — che poi
   * sarebbero partite verso Home Assistant e finite nella configurazione di
   * una telecamera. Un campo che si riempie da solo con un segreto che non
   * c'entra è peggio di un campo scomodo.
   */
  let touched = $state<Record<string, boolean>>({});

  /**
   * Quello che la persona aveva gia' scritto, che sopravvive al passo.
   *
   * Un accoppiamento puo' andare storto senza colpa di chi scrive: Home
   * Assistant risponde che la conversazione e' scaduta, la telecamera non si
   * fa raggiungere, l'agente ci mette troppo. Ricominciare da un modulo vuoto
   * vuol dire ribattere a mano un indirizzo rtsp:// — cioe' proprio la parte
   * scomoda — per colpa di qualcosa che e' successo altrove. Si tiene da
   * parte, e se il passo dopo chiede le stesse cose si ritrova dov'era.
   */
  let kept: Record<string, string | boolean> = {};

  /** Di quello tenuto da parte si rimette solo cio' che il passo nuovo chiede. */
  function again(next: PairingStep | null): Record<string, string | boolean> {
    const back: Record<string, string | boolean> = {};
    for (const field of next?.fields ?? []) {
      const was = kept[field.name];
      if (was !== undefined && was !== '') back[field.name] = was;
      // Niente da riprendere: si parte da quello che propone la casa, che e'
      // quasi sempre la risposta giusta — e cosi' la levetta mostra com'e'
      // davvero, invece di fingersi spenta.
      else if (field.preset !== undefined) back[field.name] = field.preset;
    }
    return back;
  }

  const closed = $derived(!step || step.kind === 'done');
  const which = $derived(ACCOUNTS.find((one) => one.handler === handler)?.label ?? handler);

  async function go(action: 'start' | 'submit' | 'cancel', input: Record<string, string | boolean> = {}) {
    busy = true;
    // Prima di partire si mette da parte quello che c'e' scritto adesso: se si
    // torna a chiedere le stesse cose — un errore, una conversazione scaduta,
    // un «riprova» — deve ritrovarsi li'.
    if (action !== 'cancel') kept = { ...kept, ...answers };
    try {
      const next = await devices.pair(agent, action, {
        handler,
        ...(step?.flowId ? { flowId: step.flowId } : {}),
        ...(action === 'submit' ? { input } : {}),
      });

      if (action === 'cancel') {
        // Annullare e' una scelta, non un incidente: qui si butta via davvero.
        step = null;
        answers = {};
        touched = {};
        kept = {};
        return;
      }

      step = next;
      answers = again(next);
      touched = {};
      if (next?.kind === 'done') {
        kept = {};
        toast.show(`${which} collegato: i dispositivi stanno arrivando`);
        linked = await devices.linked(agent).catch(() => linked);
      }
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      busy = false;
    }
  }

  function begin(chosen: string) {
    // Marche diverse chiedono cose diverse: quello che avevi scritto per una
    // non vuol dire niente per l'altra.
    if (chosen !== handler) {
      kept = {};
      answers = {};
    }
    handler = chosen;
    step = null;
    void go('start');
  }

  /** Niente parte prima di un sì: collegare un account non è un clic qualunque. */
  function ask(event: MouseEvent, account: (typeof ACCOUNTS)[number]) {
    ui.askSure(event.currentTarget as HTMLElement, {
      title: `Collegare ${account.label}?`,
      detail: account.warns,
      verb: 'Collega',
      tone: 'plain',
      no: 'Non ora',
      onYes: () => begin(account.handler),
    });
  }

  /**
   * Un codice incollato si porta dietro gli spazi ai bordi, e certi codici
   * distinguono maiuscole e minuscole: si tolgono quelli, non il resto. Un
   * sì/no non si tocca: non ha bordi da pulire.
   */
  function cleaned(): Record<string, string | boolean> {
    const out: Record<string, string | boolean> = {};
    for (const field of step?.fields ?? []) {
      const value = answers[field.name];
      const clean = typeof value === 'string' ? value.trim() : value;
      /*
       * Un campo che si poteva lasciare vuoto, e che e' stato lasciato vuoto,
       * non si manda: si tace. Per Home Assistant «» non vuol dire «niente»,
       * vuol dire una stringa — e dove aspetta uno fra pochi valori possibili,
       * la stringa vuota non e' fra quelli e la richiesta intera viene
       * rifiutata per un campo che nessuno voleva riempire.
       */
      if (clean === undefined || (clean === '' && !field.required)) continue;
      out[field.name] = clean;
    }
    return out;
  }

  const submit = () => go('submit', cleaned());

  async function detach(account: LinkedAccount, label: string) {
    busy = true;
    try {
      linked = await devices.unlink(agent, account.entryId);
      toast.show(`${label} scollegato: i suoi dispositivi se ne vanno con lui`);
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      busy = false;
    }
  }
</script>

{#if closed}
  <div class="accounts">
    {#each ACCOUNTS as account (account.handler)}
      {@const joint = joined(account.handler)}
      <div class="account" class:is-joined={!!joint}>
        <span class="mark" aria-hidden="true"></span>
        <span class="who">
          <b>{account.label}</b>
          {#if joint}<span class="as">{joint.title}</span>{/if}
        </span>

        {#if joint}
          <Button
            look="link"
            tone="danger"
            extra="kill"
            disabled={busy}
            onclick={(event: MouseEvent) =>
              ui.askSure(event.currentTarget as HTMLElement, {
                title: `Scollegare ${account.label}?`,
                detail: "L'agente si porta via i suoi dispositivi. Il collegamento si rifà quando vuoi.",
                verb: 'Scollega',
                onYes: () => void detach(joint, account.label),
              })}
          >
            Scollega
          </Button>
        {:else}
          <!-- stessa misura di «Scollega»: in questo elenco ogni azione è un
               comando scritto piccolo, e due misure diverse sulla stessa
               colonna si vedono -->
          <Button
            look="link"
            disabled={!agent.online || busy}
            title={agent.online ? `Collega ${account.label}` : "L'agente non è collegato"}
            onclick={(event: MouseEvent) => ask(event, account)}
          >
            Collega
          </Button>
        {/if}
      </div>
    {/each}
  </div>
{:else if step}
  <div class="pair" class:is-busy={busy}>
    <span class="eyebrow">{which}</span>

    {#if step.error}
      <p class="wrong">{step.error}</p>
    {/if}

    {#if step.kind === 'failed'}
      <div class="acts">
        <Button look="ghost" size="sm" disabled={busy} onclick={() => begin(handler)}>Riprova</Button>
        <Button look="link" disabled={busy} onclick={() => (step = null)}>Lascia stare</Button>
      </div>
    {:else if step.kind === 'busy'}
      <p class="say">{step.note}</p>
      <div class="acts">
        <Button look="ghost" size="sm" disabled={busy} onclick={() => begin(handler)}>Riprova</Button>
        <Button look="link" disabled={busy} onclick={() => (step = null)}>Più tardi</Button>
      </div>
    {:else if step.qr}
      <p class="say">
        Inquadra questo codice con l'app <b>Smart Life</b> (o Tuya Smart). Quando l'app ha finito,
        conferma qui sotto.
      </p>
      <Qr data={step.qr} label="Codice da inquadrare" />
      <div class="acts">
        <Button look="primary" size="sm" disabled={busy} onclick={submit}>Ho inquadrato</Button>
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {:else if step.fields.length}
      {#if handler === 'tuya'}
        <p class="say">
          Serve il tuo codice utente. Nell'app <b>Smart Life</b> (o Tuya Smart):
          <i>Impostazioni</i> → <i>Account e sicurezza</i>, alla voce <i>User Code</i>.
        </p>
        <p class="say careful">Copialo <b>esattamente</b> com'è: maiuscole e minuscole contano.</p>
      {:else if handler === 'sonoff'}
        <p class="say">
          Entra con le stesse credenziali che usi nell'app <b>eWeLink</b>: l'email <b>intera</b>,
          oppure il numero di telefono.
        </p>
      {:else if handler === 'generic'}
        <p class="say">
          Serve l'indirizzo del flusso: una riga che comincia per <b>rtsp://</b>, quella che ti dà
          il registratore o la telecamera. Un canale per volta.
        </p>
        <p class="say careful">
          Se l'immagine non arriva, scegli <b>TCP</b>: certi registratori dichiarano un indirizzo
          di ritorno che non esiste più, e solo il TCP lo ignora.
        </p>
      {/if}

      {#each step.fields as field (field.name)}
        {#if field.yesno}
          <!-- Un sì/no non è un campo da riempire: è una levetta, e la levetta
               si porta già il suo nome. Fuori dalla <label> degli altri: una
               levetta è a sua volta una label, e una dentro l'altra non si fa. -->
          <Switch
            checked={answers[field.name] === true}
            onchange={(value: boolean) => (answers = { ...answers, [field.name]: value })}
            label={named(field.name)}
          />
        {:else}
        <label class="field">
          <span class="eyebrow">
            {named(field.name)}{#if !field.required}<i class="may">opzionale</i>{/if}
          </span>
          {#if field.options}
            <select
              bind:value={
                () => answers[field.name] ?? '',
                (value) => (answers = { ...answers, [field.name]: value })
              }
            >
              <option value="">—</option>
              {#each field.options as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {:else}
            <input
            type={field.secret ? 'password' : 'text'}
            readonly={!touched[field.name]}
            onfocus={() => (touched = { ...touched, [field.name]: true })}
            autocomplete={field.secret ? 'new-password' : 'off'}
            data-lpignore="true"
            data-1p-ignore
            spellcheck="false"
            autocapitalize="off"
            autocorrect="off"
            bind:value={
              () => answers[field.name] ?? '',
              (value) => (answers = { ...answers, [field.name]: value })
            }
              onkeydown={(event) => event.key === 'Enter' && submit()}
            />
          {/if}
        </label>
        {/if}
      {/each}

      <div class="acts">
        <Button look="primary" size="sm" disabled={busy} onclick={submit}>Continua</Button>
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {:else}
      <p class="say">Sto aspettando {which}…</p>
      <div class="acts">
        <Button look="link" disabled={busy} onclick={() => go('cancel')}>Annulla</Button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* «opzionale» accanto al nome: piccolo e smorto, ma c'è — un campo che si
     può lasciare vuoto e non lo dice è un campo che qualcuno riempirà */
  .may {
    margin-left: 6px;
    font-style: normal;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: var(--ink-3);
    opacity: 0.8;
  }

  .accounts { display: grid; gap: 4px; }

  .account {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* collegato o no, si vede dal pallino prima ancora di leggere */
  .mark {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
    opacity: 0.5;
  }

  .account.is-joined .mark { background: #2f9e5e; opacity: 1; }

  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11.5px;
    color: var(--ink-3);
    overflow: hidden;
  }

  .who b { font-weight: 560; color: var(--ink-2); }

  .account.is-joined .who b { color: var(--ink); }

  /* con che utente sei entrato: utile per sapere se è quello giusto */
  .as {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .pair {
    display: grid;
    gap: 9px;
    min-width: 0;
    animation: rise 0.2s var(--ease);
  }

  /* mentre la battuta è in volo non si preme due volte */
  .pair.is-busy { opacity: 0.6; }

  .say { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-2); }

  .say b { font-weight: 600; color: var(--ink); }

  .say i { font-style: normal; font-weight: 560; color: var(--ink); }

  /* La tastiera del telefono mette la maiuscola alla prima lettera da sola, e
     quel codice diventa sbagliato senza che tu abbia toccato niente. Il campo
     la disattiva; questa riga lo dice comunque, perché c'è chi lo ricopia. */
  .careful { color: var(--ink-3); }

  /* quello che la marca ha da ridire: il motivo arriva intero, non tradotto
     in "qualcosa è andato storto" */
  .wrong {
    margin: 0;
    padding: 7px 10px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--danger);
  }

  .acts { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

  /* un elenco lungo duecento voci: si veste come i campi, non come il menù
     grigio del sistema */
  select {
    font: inherit;
    width: 100%;
    padding: 9px 11px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: var(--sunken);
    color: var(--ink);
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  }

  select:hover { background: var(--sunken-hover); }

  select:focus {
    outline: 0;
    background: var(--glass-strong);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--accent) 11%, transparent);
  }
</style>
