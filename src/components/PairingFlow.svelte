<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { devices, type Agent } from '../lib/devices.svelte';
  import { toast } from '../lib/toast.svelte';
  import { nelRegistro, type Provider } from '../lib/providers';
  import { tasti } from '../lib/fondo.svelte';
  import { unici } from '../lib/unici';
  import type { ModalAction } from '../lib/ui.svelte';
  import type { PairingStep } from '../lib/types';
  import Button from './Button.svelte';
  import TextField from './TextField.svelte';
  import Switch from './Switch.svelte';
  import Qr from './Qr.svelte';

  /**
   * La conversazione per collegare qualcosa a un agente.
   *
   * Ogni marca ha il suo rito — Tuya vuole un codice e poi un QR, eWeLink
   * email e password, una telecamera un indirizzo — ma il dialogo è lo
   * stesso: di là dicono cosa chiedere, noi lo chiediamo, e quando c'è un QR
   * o uno scatto li disegniamo.
   *
   * Vive quanto la conversazione: nasce quando qualcuno preme «Collega» e
   * muore quando ha finito. È il motivo per cui quello che hai scritto non si
   * perde fra un passo e l'altro ma sparisce davvero quando te ne vai —
   * niente sopravvive a un componente che non c'è più.
   *
   * Nei testi non si nomina mai cosa gira dentro l'agente: per chi guarda
   * c'è l'agente, che sta in un posto e collega le cose.
   */
  let {
    agent,
    provider,
    riprendi,
    onquit,
    ondone,
  }: {
    agent: Agent;
    /** Cosa si collega, e come si spiega (lib/providers.ts). */
    provider: Provider;
    /**
     * La conversazione già aperta dalla centrale per rientrare in un account
     * scaduto. Si riprende quella invece di cominciarne una nuova, così i
     * dispositivi restano gli stessi.
     */
    riprendi?: string;
    /** Se ne va senza aver collegato niente. */
    onquit: () => void;
    /** Ha collegato: chi tiene l'elenco lo rilegga. */
    ondone: () => void;
  } = $props();

  /** Come si chiamano i campi, detto in italiano. */
  const LABELS: Record<string, string> = {
    confirmed_ok: 'L’immagine è quella giusta',
    still_image_url: 'Indirizzo di un’immagine fissa',
    stream_source: 'Indirizzo del flusso',
    rtsp_transport: 'Come raggiungere il flusso',
    authentication: 'Tipo di autenticazione',
    framerate: 'Fotogrammi al secondo',
    verify_ssl: 'Verifica il certificato',
    limit_refetch_to_url_change: "Rileggi solo se cambia l'indirizzo",
    use_wallclock_as_timestamps: "Usa l'ora del computer",
    content_type: 'Tipo di contenuto',
    user_code: 'Codice utente',
    country_code: "Paese dell'account",
    password: 'Password',
    email: 'Email',
    host: 'Indirizzo',
  };

  /*
   * Il nome di un campo: quello scritto da noi per questa marca, poi il
   * nostro dizionario, poi la traduzione che manda la centrale, e per
   * ultimo il nome tecnico, leggibile almeno senza trattini.
   */
  const named = (name: string, tradotto?: string) =>
    provider.campi?.[name] ?? LABELS[name] ?? tradotto ?? name.replace(/_/g, ' ');

  let step = $state<PairingStep | null>(null);
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
   * sarebbero finite nella configurazione di una telecamera. Un campo che si
   * riempie da solo con un segreto che non c'entra è peggio di un campo
   * scomodo.
   */
  let touched = $state<Record<string, boolean>>({});

  /**
   * Quello che la persona aveva già scritto, che sopravvive al passo.
   *
   * Un accoppiamento può andare storto senza colpa di chi scrive: la
   * conversazione scade, la telecamera non si fa raggiungere, l'agente ci
   * mette troppo. Ricominciare da un modulo vuoto vuol dire ribattere a mano
   * un indirizzo rtsp:// — cioè proprio la parte scomoda — per colpa di
   * qualcosa che è successo altrove.
   */
  let kept: Record<string, string | boolean> = {};

  /** Di quello tenuto da parte si rimette solo ciò che il passo nuovo chiede. */
  function again(next: PairingStep | null): Record<string, string | boolean> {
    const back: Record<string, string | boolean> = {};
    for (const field of next?.fields ?? []) {
      const was = kept[field.name];
      if (was !== undefined && was !== '') back[field.name] = was;
      // Niente da riprendere: si parte da quello che propone la casa, che è
      // quasi sempre la risposta giusta — e così la levetta mostra com'è
      // davvero, invece di fingersi spenta.
      else if (field.preset !== undefined) back[field.name] = field.preset;
    }
    return back;
  }

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

  /**
   * Una conversazione che la centrale tiene aperta, e che se ne va solo se
   * qualcuno le dice di chiudersi. Quella di un ricollegamento no: l'ha
   * aperta la centrale e resta lì, e chiudendola «Ricollega» sparirebbe
   * finché lei non ne apre un'altra.
   */
  const aperta = (passo: PairingStep | null): passo is PairingStep =>
    !riprendi && passo?.kind === 'form' && !!passo.flowId;

  const lascia = (passo: PairingStep) =>
    void devices.pair(agent, 'cancel', { handler: provider.handler, flowId: passo.flowId }).catch(() => undefined);

  /** Se questo pezzo c'è ancora: la risposta dell'agente può arrivare dopo. */
  let vivo = true;

  /*
   * Andarsene annulla, da qualunque parte si esca — «Annulla», la crocetta,
   * Esc, il dito che spinge via la finestra, un'altra pagina. Era solo
   * «Annulla» a chiuderla, e le altre strade lasciavano di là una
   * conversazione a metà che teneva occupata la marca.
   */
  onDestroy(() => {
    vivo = false;
    if (aperta(step)) lascia(step);
  });

  async function go(action: 'start' | 'submit', input: Record<string, string | boolean> = {}) {
    // una battuta alla volta: due Invio di fila mandavano due risposte sulla
    // stessa conversazione, e la seconda arrivava a un passo che non c'era più
    if (busy) return;
    busy = true;
    // Prima di partire si mette da parte quello che c'è scritto adesso: se si
    // torna a chiedere le stesse cose — un errore, una conversazione scaduta,
    // un «riprova» — deve ritrovarsi lì.
    kept = { ...kept, ...answers };

    const flowId = step?.flowId || riprendi;
    try {
      const next = await devices.pair(agent, action, {
        handler: provider.handler,
        ...(flowId ? { flowId } : {}),
        ...(action === 'submit' ? { input } : {}),
      });

      // chiusa mentre si aspettava: quello che è appena nato di là si chiude
      if (!vivo) {
        if (aperta(next)) lascia(next);
        return;
      }

      step = next;
      answers = again(next);
      touched = {};

      if (next?.kind === 'done') {
        toast.show(`${provider.label} si collega, i dispositivi stanno arrivando`);
        ondone();
      }
    } catch (error) {
      if (vivo) toast.show((error as Error).message);
    } finally {
      busy = false;
    }
  }

  /** Si comincia appena si compare: chi ha premuto ha già detto di sì. */
  /*
   * Prima di cominciare, se questa marca ha qualcosa da dire prima: eWeLink
   * la prima volta installa un pezzo e fa riavviare la macchina, e chi
   * preme deve saperlo prima, non dopo. Stava nella domanda del tasto
   * «Collega»; adesso che si parte dalla ricerca, è il primo passo.
   */
  // chi ricollega sa già cosa sta facendo: l'avviso serviva alla prima volta
  const avvisoPrima = $derived(!riprendi && nelRegistro(provider.handler) && !!provider.warns);
  let avvisato = $state(false);

  onMount(() => {
    if (!avvisoPrima) void go('start');
  });

  function comincia(): void {
    avvisato = true;
    void go('start');
  }

  /** Da capo, con quello che avevi scritto ancora in mano. */
  function restart(): void {
    step = null;
    void go('start');
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
       * Un campo che si poteva lasciare vuoto, e che è stato lasciato vuoto,
       * non si manda: si tace. Di là «» non vuol dire «niente», vuol dire una
       * stringa — e dove aspetta uno fra pochi valori possibili, la stringa
       * vuota non è fra quelli e la richiesta intera viene rifiutata per un
       * campo che nessuno voleva riempire.
       */
      if (clean === undefined || (clean === '' && !field.required)) continue;
      out[field.name] = clean;
    }
    return out;
  }

  /** Si manda solo un modulo pronto, da qualunque parte arrivi, perché Invio deve valere quanto il tasto, che fino ad allora è spento. */
  const submit = () => {
    if (busy || !ready) return;
    void go('submit', cleaned());
  };

  /**
   * Se c'è abbastanza per mandare qualcosa.
   *
   * Un campo obbligatorio vuoto fa rifiutare la richiesta dall'altra parte, e
   * il rifiuto torna indietro dopo qualche secondo per dire una cosa che si
   * sapeva già prima di partire. Tanto vale non far premere.
   *
   * Una levetta obbligatoria è il caso che conta: «l'immagine è quella
   * giusta» spenta vuol dire che non hai confermato, e un tasto che si lascia
   * premere lo stesso fa credere di aver risposto.
   */
  const ready = $derived(
    (step?.fields ?? []).every((field) => {
      if (!field.required) return true;
      const value = answers[field.name];
      return field.yesno ? value === true : typeof value === 'string' && value.trim() !== '';
    }),
  );

  /*
   * I tasti in fondo, secondo il passo. Dentro una finestra li disegna lei
   * (`tasti()`), fuori si disegnano qui sotto. Un tasto che torna `false`
   * lascia la finestra aperta: la conversazione va avanti dentro.
   */
  function azioni(): ModalAction[] {
    // chiudersi basta: la conversazione aperta la annulla chi se ne va
    const annulla: ModalAction = { label: 'Annulla', look: 'ghost', onpick: () => onquit() };
    if (avvisoPrima && !avvisato) {
      return [
        { label: 'Annulla', look: 'ghost', onpick: () => onquit() },
        { label: 'Comincia', look: 'primary', onpick: () => (comincia(), false) },
      ];
    }
    if (!step) return [annulla];
    if (step.kind === 'failed') {
      return [
        { label: 'Annulla', look: 'ghost', disabled: busy, onpick: () => onquit() },
        { label: 'Riprova', look: 'primary', disabled: busy, onpick: () => (restart(), false) },
      ];
    }
    if (step.kind === 'busy') {
      return [
        { label: 'Più tardi', look: 'ghost', disabled: busy, onpick: () => onquit() },
        { label: 'Riprova', look: 'primary', disabled: busy, onpick: () => (restart(), false) },
      ];
    }
    if (step.qr) return [annulla, { label: 'Ho inquadrato', look: 'primary', disabled: busy, onpick: () => (submit(), false) }];
    if (step.fields.length) {
      return [annulla, { label: 'Continua', look: 'primary', disabled: busy || !ready, onpick: () => (submit(), false) }];
    }
    return [annulla];
  }

  const inFinestra = tasti(azioni);
</script>

<div class="pair" class:is-busy={busy}>
  <!-- in una finestra il nome sta già nel titolo -->
  {#if !inFinestra}
    <span class="eyebrow">{riprendi ? `Ricollega ${provider.label}` : provider.label}</span>
  {/if}

  {#if step?.error}
    <p class="wrong">{step.error}</p>
  {/if}

  {#if avvisoPrima && !avvisato}
    <p class="say">{provider.warns}</p>
  {:else if !step}
    <p class="say">Un momento…</p>
  {:else if step.kind === 'failed'}
    <!-- cosa non è andato lo dice l'errore qui sopra; cosa fare, i tasti in fondo -->
  {:else if step.kind === 'busy'}
    <p class="say">{step.note}</p>
  {:else if step.qr}
    <!-- il testo è della marca, perché l'app con cui si inquadra è la sua -->
    <p class="say">
      {@html provider.qr ?? 'Inquadra questo codice con l’app del servizio. Quando ha finito, conferma qui sotto.'}
    </p>
    <Qr data={step.qr} label="Codice da inquadrare" />
  {:else if step.fields.length}
    <!-- Le istruzioni servono a chi deve riempire il modulo. Al passo dove si
         guarda e basta non c'entrano più niente: dire ancora dove trovare
         l'indirizzo, davanti a un'immagine già arrivata, fa dubitare di aver
         fatto la cosa giusta. -->
    {#if step.preview}
      <!-- niente: qui si guarda -->
    {:else}
      {#each provider.istruzioni ?? [] as istruzione, at (at)}
        <p class="say" class:careful={istruzione.attento}>{@html istruzione.html}</p>
      {/each}
    {/if}

    {#if step.preview}
      <!-- Prima si guarda, poi si conferma: una levetta che dice «va bene»
           sopra un'immagine che non si vede non vuol dire niente. -->
      <p class="say">
        Questo è quello che si vede adesso da quella telecamera. Se è la
        ripresa giusta, conferma qui sotto.
      </p>
      <img class="shot" src={`data:image/jpeg;base64,${step.preview}`} alt="Anteprima della telecamera" />
    {/if}

    {#each unici(step.fields, (one) => one.name) as field (field.name)}
      {#if field.yesno}
        <!-- Un sì/no non è un campo da riempire: è una levetta, e la levetta
             si porta già il suo nome. Fuori dalla <label> degli altri: una
             levetta è a sua volta una label, e una dentro l'altra non si fa. -->
        <Switch
          checked={answers[field.name] === true}
          onchange={(value: boolean) => (answers = { ...answers, [field.name]: value })}
          label={named(field.name, field.label)}
        />
      {:else}
        <label class="field">
          <span class="eyebrow">
            {named(field.name, field.label)}{#if !field.required}<i class="may">opzionale</i>{/if}
          </span>
          {#if field.options}
            <select
              bind:value={
                () => answers[field.name] ?? '',
                (value) => (answers = { ...answers, [field.name]: value })
              }
            >
              <option value="">—</option>
              {#each unici(field.options, (one) => one.value) as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {:else}
            <!-- sorda finché non la tocchi: i gestori di password riempiono
                 qualunque campo somigli a un accesso, e qui dentro ci
                 finirebbe l'email di qualcun altro al posto dell'indirizzo di
                 una telecamera -->
            <TextField
              kind={field.secret ? 'password' : 'text'}
              shy
              autocomplete={field.secret ? 'new-password' : 'off'}
              spellcheck="false"
              autocapitalize="off"
              autocorrect="off"
              maxlength={200}
              bind:value={
                () => String(answers[field.name] ?? ''),
                (value: string) => (answers = { ...answers, [field.name]: value })
              }
              onkeydown={(event: KeyboardEvent) => event.key === 'Enter' && submit()}
            />
          {/if}
        </label>
      {/if}
    {/each}

  {:else}
    <p class="say">Sto aspettando {provider.label}…</p>
  {/if}

  {#if !inFinestra}
    <div class="acts">
      {#each azioni() as azione (azione.label)}
        <Button look={azione.look} size="sm" disabled={azione.disabled} onclick={(event: MouseEvent) => void azione.onpick(event.currentTarget as HTMLElement)}>
          {azione.label}
        </Button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pair {
    display: grid;
    gap: 9px;
    min-width: 0;
    animation: rise 0.2s var(--ease);
  }

  /* mentre la battuta è in volo non si preme due volte */
  .pair.is-busy { opacity: 0.6; }

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

  /* lo scatto di prova: largo come il modulo, e scuro sotto, perché una
     telecamera che non inquadra niente non sembri un'immagine che non arriva */
  .shot {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--ink) 85%, transparent);
  }

  .say { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-2); }

  .say :global(b) { font-weight: 600; color: var(--ink); }

  .say :global(i) { font-style: normal; font-weight: 560; color: var(--ink); }

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
