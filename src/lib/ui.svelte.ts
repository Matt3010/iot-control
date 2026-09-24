import type { Choice } from './table';
import { tick, type Component } from 'svelte';
import { auth } from './auth.svelte';
import type { IconName } from './icons';
import { readJSON, writeJSON } from './storage';
import { toast } from './toast.svelte';
import type { Draft } from './types';

export type ManageTab = 'categories' | 'groups';

/** Si chiede quale segno dare a una categoria: un disegno, o quello che c'era. */
export interface MarkRequest {
  anchor: HTMLElement;
  /** Quello che c'è adesso, per mostrarlo scelto. */
  current?: string;
  onPick: (mark: string) => void;
}

/**
 * Una domanda attaccata al tasto che l'ha fatta nascere. Di solito prima di
 * una cosa che non torna indietro — e allora il tasto è rosso. Ma a volte è
 * solo un bivio (`tone: 'plain'`): lì il rosso direbbe una cosa falsa, e le
 * due strade vanno avanti entrambe.
 */
/** Scegliere una voce da un elenco corto, accanto al tasto che l'ha chiesto. */
export interface PickRequest {
  anchor: HTMLElement;
  /** Cosa si sta scegliendo: «Su quale luogo?» */
  title: string;
  /**
   * Le voci, già in ordine di come vanno lette. Come funzione quando possono
   * cambiare mentre l'elenco è aperto: un dispositivo che riprende a
   * rispondere si deve vedere lì, non alla prossima apertura.
   */
  options: Choice[] | (() => Choice[]);
  /** Quella di adesso, che si segna e non si ripropone come novità. */
  current?: string;
  onPick: (id: string) => void;
}

export interface SureRequest {
  anchor: HTMLElement;
  /** Cosa succede, detto con il suo nome. */
  title: string;
  /** Cosa si porta dietro: si scrive solo se si porta dietro qualcosa. */
  detail?: string;
  /** Il verbo sul tasto di conferma: "Elimina", "Sciogli", "Rendi privato". */
  verb: string;
  onYes: () => void;
  /** Il tasto di sinistra. "Annulla" se non lo dici. */
  no?: string;
  /** Cosa fare scegliendo quello: niente, se non lo dici — e allora si chiude e basta. */
  onNo?: () => void;
  /** Rosso solo quando porta via qualcosa. */
  tone?: 'danger' | 'plain';
}

/**
 * Un tasto in fondo a una finestra.
 *
 * Sono i tasti dell'app: chi apre la finestra dice cosa scrivono e cosa
 * fanno, e sceglie il vestito con le stesse parole che userebbe ovunque —
 * quello importante, quello che porta via qualcosa, quello che annulla.
 */
export interface ModalAction {
  label: string;
  look?: 'primary' | 'ghost' | 'danger' | 'danger-solid' | 'link';
  tone?: 'danger';
  /** Un disegno prima della scritta, per i tasti che si riconoscono da quello. */
  icon?: IconName;
  disabled?: boolean;
  /**
   * Cosa fa, e da quale tasto è partita.
   *
   * L'elemento serve a chi deve chiedere conferma: la domanda si apre
   * accanto al tasto che l'ha fatta nascere, e il tasto qui lo disegna la
   * finestra, non chi ha scritto l'azione.
   *
   * Torna `false` per lasciarla aperta — serve quando quello che hai scritto
   * non va bene e la finestra deve dirtelo restando dov'è.
   */
  onpick: (anchor: HTMLElement) => boolean | void | Promise<boolean | void>;
}

/**
 * Una finestra che si apre davanti a tutto.
 *
 * Dentro non ci va del testo: ci va **un componente**, lo stesso che
 * potrebbe stare dentro a un pannello. È il motivo per cui esiste questa
 * forma — il contenuto non sa dove sta, e spostarlo da una parte all'altra
 * non lo tocca.
 */
export interface ModalRequest {
  title: string;
  /** Il componente da mostrare. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  view: Component<any>;
  /** Quello che gli serve per disegnarsi. */
  props?: Record<string, unknown>;
  /** I tasti in fondo. Senza, in fondo non c'è niente. */
  actions?: ModalAction[];
  /**
   * Cosa fare quando si chiude, comunque la si chiuda.
   *
   * Una finestra si chiude dalla crocetta, con Esc, spingendola via col dito
   * o premendo un tasto in fondo. Chi l'ha aperta ha quasi sempre qualcosa da
   * rimettere a posto — delle righe da lasciar andare, uno stato da azzerare
   * — e scriverlo su ognuna di quelle quattro strade vuol dire dimenticarsene
   * su una.
   */
  onclose?: () => void;
  /**
   * Se si appoggia sulla finestra davanti invece di prenderne il posto:
   * chiusa questa, si torna a quella con tutto com'era.
   *
   * Di solito non lo dice nessuno, e lo decide `openModal` guardando da dove
   * è partita: da dentro la finestra davanti ci si appoggia sopra, da fuori
   * se ne prende il posto. Lo si scrive solo per cambiare quella scelta.
   */
  sopra?: boolean;
  /**
   * A tutto schermo invece che di lato: una telecamera, dove quello che si
   * guarda è l'immagine e il resto della pagina è solo d'intralcio. È la
   * stessa finestra, nella stessa pila — un Esc chiude lei e basta, e sotto
   * resta quello che c'era.
   */
  intera?: boolean;
}

export interface ColorRequest {
  anchor: HTMLElement;
  current: string;
  onPick: (color: string) => void;
}

/**
 * La scheda di destra resta dove l'hai lasciata: ricaricare la pagina non deve
 * farti ritrovare da capo la linguetta che stavi guardando.
 */
const RICORDO = 'pi.scheda';
interface Ricordo {
  tab: ManageTab;
}

/**
 * Di quella finestra si ricorda su quale linguetta eri, non che era aperta.
 *
 * Riaprirla da sola voleva dire trovarsi davanti categorie e gruppi appena
 * accesa l'app, senza averlo chiesto — su un telefono a schermo intero, per
 * giunta. E dopo che la finestra è diventata un componente suo, quel ricordo
 * riapriva soltanto lo stato: nessuna finestra sullo schermo, ma l'app che si
 * credeva con una scheda aperta, e il tasto per aggiungere un luogo nascosto
 * dietro a niente.
 */
const ricordo = readJSON<Ricordo>(RICORDO, { tab: 'categories' });

/** Cosa c'è aperto davanti, e cosa sta modificando la scheda di un luogo. */
class Ui {
  #tab = $state<ManageTab>(ricordo.tab);
  draft = $state<Draft | null>(null);

  /** La linguetta si legge come un campo, ma passando di qui si ricorda. */
  get manageTab(): ManageTab {
    return this.#tab;
  }

  set manageTab(tab: ManageTab) {
    this.#tab = tab;
    this.#ricorda();
  }
  picking = $state(false);
  paletteOpen = $state(false);
  mark = $state<MarkRequest | null>(null);
  color = $state<ColorRequest | null>(null);
  sure = $state<SureRequest | null>(null);
  pick = $state<PickRequest | null>(null);
  /**
   * Le finestre aperte, una sopra l'altra, e si vede solo l'ultima.
   *
   * Una finestra aperta da dentro un'altra — la soglia chiesta mentre si
   * scrive una scena, categorie e gruppi mentre si aggiunge un luogo — ci
   * si appoggia sopra, e quella sotto resta montata e nascosta: quando la
   * nuova si chiude si torna a quella di prima con quello che c'era scritto.
   * Sostituendola, il lavoro fatto dentro se ne andava con lei.
   *
   * `raw` perché qui dentro si cercano le richieste per identità, e un
   * elenco vivo le avvolgerebbe in un'altra cosa.
   */
  modals = $state.raw<ModalRequest[]>([]);

  /** Quella davanti, l'unica che si vede. */
  get modal(): ModalRequest | null {
    return this.modals.at(-1) ?? null;
  }

  /** Il guscio di ogni finestra, per sapere cosa ci sta dentro. */
  #gusci = new WeakMap<ModalRequest, HTMLElement>();
  /**
   * Da dove è stata aperta ogni finestra, per tornarci col fuoco quando si
   * chiude. Il tasto e tutto quello che gli sta intorno, fino in cima,
   * presi quando si apre: se alla chiusura il tasto non c'è più — il fumetto
   * di un segno sulla mappa si chiude mentre modifichi il luogo — si torna al
   * più vicino fra quelli rimasti, invece di perdere il fuoco in fondo alla
   * pagina.
   */
  #origini = new WeakMap<ModalRequest, Element[]>();

  /**
   * Quello che si è aperto sopra a tutto il resto e si chiude con Esc: un
   * elenco da cui scegliere, un menu, un foglietto. L'ultimo della fila è
   * quello davanti.
   *
   * Lo tiene chi lo apre, con uno stato suo, e qui si fa conoscere con
   * `sopra()`. Senza, un Esc con l'elenco dell'attesa aperto passava
   * dritto alla finestra sotto e chiudeva tutta la scena, perché qui non si
   * sapeva che l'elenco c'era.
   */
  #sopra: (() => void)[] = [];

  /**
   * Si dice che qualcosa si è aperto sopra, con il modo di chiuderlo. Torna
   * la funzione da chiamare quando si chiude per conto suo.
   */
  sopra(chiudi: () => void): () => void {
    this.#sopra.push(chiudi);
    return () => {
      const at = this.#sopra.lastIndexOf(chiudi);
      if (at >= 0) this.#sopra.splice(at, 1);
    };
  }

  /** Lo dice il guscio quando si disegna: `Modal.svelte`. */
  registra(request: ModalRequest, guscio: HTMLElement): void {
    this.#gusci.set(request, guscio);
  }

  /** Il guscio della finestra davanti, per chi deve cercarci dentro. */
  get guscioDavanti(): HTMLElement | undefined {
    return this.modal ? this.#gusci.get(this.modal) : undefined;
  }
  /** 'add' significa: ho premuto + , mettimi il cursore nel campo giusto. */
  manageIntent = $state<'browse' | 'add'>('browse');
  /** La finestra della scheda di un luogo, per toglierla anche da sotto un'altra. */
  #place: ModalRequest | null = null;
  /** E quella di categorie e gruppi. */
  #manage: ModalRequest | null = null;

  /**
   * La scheda di un luogo è una finestra, come categorie e gruppi.
   *
   * Erano due gusci che facevano lo stesso lavoro — la stessa posizione, la
   * stessa larghezza, gli stessi angoli, lo stesso prendersi lo schermo su un
   * telefono — scritti in due posti. Adesso il guscio è uno, e la scheda è
   * quello che ci sta dentro. Il titolo lo decide chi apre, perché dipende da
   * cosa stai aprendo, mentre i tasti in fondo li detta la scheda stessa,
   * perché dipendono da com'è messa lei.
   */
  openPlace(draft: Draft): void {
    /*
     * Una copia, sempre. Dall'elenco del telefono e dalla ricerca arrivava il
     * luogo vero dell'archivio, e la scheda ci scriveva sopra mentre digitavi:
     * «Annulla» non annullava niente, e al salvataggio il «com'era prima» da
     * rimettere se il server diceva di no era già quello modificato.
     */
    this.draft = $state.snapshot(draft) as Draft;
    this.picking = false;
    if (!this.placeView) return;

    const suo = !draft.id || auth.canTouch(draft.id);
    const finestra: ModalRequest = {
      title: !suo ? 'Luogo' : draft.id ? 'Modifica luogo' : 'Nuovo luogo',
      view: this.placeView,
      // la bozza è una sola: una seconda scheda sopra alla prima scriverebbe nella stessa
      sopra: false,
      onclose: () => {
        if (this.#place !== finestra) return;
        this.#place = null;
        this.draft = null;
      },
    };
    this.#place = finestra;
    this.openModal(finestra);
  }

  closePlace(): void {
    this.draft = null;
    const finestra = this.#place;
    this.#place = null;
    // solo lei: se sopra c'è categorie e gruppi, quella resta dov'è
    if (!finestra) return;
    this.modals = this.modals.filter((one) => one !== finestra);
    this.#rendiIlFuoco(finestra);
  }

  /** Quale delle due finestre è davanti, per chi deve saperlo. */
  get placeOpen(): boolean {
    return this.placeView !== null && this.modal?.view === this.placeView;
  }

  /**
   * Cosa mostrare quando si aprono categorie e gruppi.
   *
   * Lo dice chi avvia l'applicazione, una volta: qui dentro non si importa
   * nessun componente, se no l'archivio dello stato e le schermate si
   * terrebbero per mano e nessuno dei due si potrebbe leggere da solo.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manageView: Component<any> | null = null;

  /** E quello della scheda di un luogo, che è una finestra come l'altra. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  placeView: Component<any> | null = null;

  openManage(tab: ManageTab = 'categories', intent: 'browse' | 'add' = 'browse'): void {
    this.#tab = tab;
    this.manageIntent = intent;
    this.#ricorda();
    if (!this.manageView) return;
    // già aperta: si cambia linguetta e basta
    if (this.#manage && this.modals.includes(this.#manage)) return;

    // e si vede dentro a una finestra, che di cosa ci sia dentro non sa niente
    const finestra: ModalRequest = {
      title: 'Categorie e gruppi',
      view: this.manageView,
      /* Dalla scheda di un luogo le ci si appoggia sopra: la bozza resta
         dov'è, e chiusa questa torna davanti con dentro la categoria appena
         creata. */
      sopra: this.placeOpen,
      onclose: () => {
        if (this.#manage === finestra) this.#manage = null;
        this.mark = null;
        this.color = null;
      },
    };
    this.#manage = finestra;
    this.openModal(finestra);
  }

  closeManage(): void {
    if (this.#manage) this.closeModal(this.#manage);
  }

  toggleManage(tab: ManageTab = 'categories', intent: 'browse' | 'add' = 'browse'): void {
    if (this.manageOpen && this.manageTab === tab) this.closeManage();
    else this.openManage(tab, intent);
  }

  /** Quale delle due finestre è davanti, per chi deve saperlo. */
  get manageOpen(): boolean {
    return this.modal?.view === this.manageView;
  }

  setPicking(on: boolean): void {
    this.picking = on;
    if (on) this.closePlace();
  }

  askMark(anchor: HTMLElement, current: string | undefined, onPick: (mark: string) => void): void {
    this.color = null;
    this.mark = { anchor, current, onPick };
  }

  askColor(anchor: HTMLElement, current: string, onPick: (color: string) => void): void {
    this.mark = null;
    this.color = { anchor, current, onPick };
  }

  /** Chiede conferma accanto al tasto che l'ha chiesta. */
  askSure(anchor: HTMLElement, question: Omit<SureRequest, 'anchor'>): void {
    this.mark = null;
    this.color = null;
    this.pick = null;
    this.sure = { anchor, ...question };
  }

  /** Fa scegliere una voce accanto al tasto che l'ha chiesta. */
  askPick(anchor: HTMLElement, question: Omit<PickRequest, 'anchor'>): void {
    this.mark = null;
    this.color = null;
    this.sure = null;
    this.pick = { anchor, ...question };
  }

  /**
   * Apre una finestra su un componente.
   *
   * Si chiama da dove serve, senza che chi chiama debba tenersi uno stato
   * suo e un `{#if}` da qualche parte: è lo stesso modo in cui si chiede una
   * conferma o si fa scegliere una voce.
   *
   * Con `sopra` si appoggia su quella davanti; senza, prende il posto di
   * tutte, e quelle che se ne vanno hanno le loro cose da rimettere a posto
   * come se le avessi chiuse tu.
   */
  openModal(request: ModalRequest): void {
    /*
     * Da dove parte la si guarda qui, e non la dice chi chiama.
     *
     * Chi apre una finestra da un pezzo che sta anche dentro un'altra — il
     * catalogo dei servizi dalla scheda di un agente, che vive anche nella
     * scheda di un luogo — non sa dove sta, e ogni volta che se n'è
     * dimenticato la finestra nuova ha preso il posto di quella sotto,
     * portandosi via la bozza.
     */
    const origine = daDove();
    const sopra = request.sopra ?? (!!origine && !!this.guscioDavanti?.contains(origine));
    if (origine) this.#origini.set(request, risalendo(origine));

    // un foglietto aperto resta attaccato a quello che adesso finisce coperto
    this.#chiudiFoglietti(() => true);

    if (sopra) {
      this.modals = [...this.modals.filter((one) => one !== request), request];
      return;
    }
    const prima = this.modals.filter((one) => one !== request).reverse();
    this.modals = [request];
    for (const chiusa of prima) chiusa.onclose?.();
  }

  /**
   * Chiude quella davanti, o quella che dici e quelle che le stanno sopra.
   *
   * Chi chiude dopo aver aspettato qualcosa dice quale: nel frattempo
   * poteva essersene aperta un'altra, e sarebbe stata lei a sparire. Una
   * finestra già chiusa non chiude niente.
   */
  closeModal(which: ModalRequest | undefined = this.modal ?? undefined): void {
    const at = which ? this.modals.indexOf(which) : -1;
    if (at < 0) return;
    const chiuse = this.modals.slice(at).reverse();
    this.modals = this.modals.slice(0, at);
    for (const chiusa of chiuse) {
      const guscio = this.#gusci.get(chiusa);
      this.#chiudiFoglietti((anchor) => !!guscio?.contains(anchor));
      chiusa.onclose?.();
    }
    if (which) this.#rendiIlFuoco(which);
  }

  /**
   * Il fuoco torna dove si era, quando una finestra si chiude.
   *
   * Sul tasto che l'ha aperta, se c'è ancora e sta nella finestra che torna
   * davanti; se no sulla finestra stessa. Lasciato sul guscio appena
   * smontato, finiva in fondo alla pagina, e con la tastiera si
   * ricominciava da capo.
   */
  #rendiIlFuoco(chiusa: ModalRequest): void {
    const strada = this.#origini.get(chiusa) ?? [];
    const davanti = this.modal;
    void tick().then(() => {
      // nel frattempo se n'è aperta un'altra: il fuoco è suo
      if (this.modal !== davanti) return;
      const guscio = davanti ? this.#gusci.get(davanti) : undefined;
      const vicino = strada.find(
        (one) => one.isConnected && focalizzabile(one) && (!guscio || guscio.contains(one)),
      );
      const torna = vicino ?? guscio;
      if (torna instanceof HTMLElement) torna.focus({ preventScroll: true });
    });
  }

  /** Chiude le domande a foglietto attaccate a un tasto che `via` sceglie. */
  #chiudiFoglietti(via: (anchor: HTMLElement) => boolean): void {
    if (this.sure && via(this.sure.anchor)) this.sure = null;
    if (this.pick && via(this.pick.anchor)) this.pick = null;
    if (this.mark && via(this.mark.anchor)) this.mark = null;
    if (this.color && via(this.color.anchor)) this.color = null;
  }

  /**
   * Tutto, per chi cambia pagina: sopra a un'altra schermata non c'entra più
   * niente. Anche i foglietti e gli elenchi, che non stanno dentro a nessuna
   * finestra: una conferma rimasta aperta dopo il tasto indietro aveva
   * ancora il suo «Elimina», e premuto eliminava una cosa della pagina di
   * prima.
   */
  closeAll(): void {
    this.#chiudiFoglietti(() => true);
    for (const chiudi of this.#sopra.splice(0).reverse()) chiudi();
    this.paletteOpen = false;
    if (this.modals.length) this.closeModal(this.modals[0]);
  }

  /** Questo browser e basta: su quale linguetta eri. */
  #ricorda(): void {
    writeJSON(RICORDO, { tab: this.#tab });
  }

  /** Esc unwinds the overlay one layer at a time, topmost first. */
  escape(): boolean {
    /*
     * Si toglie quello che sta davvero davanti, e l'ordine è quello in cui le
     * cose si sovrappongono sullo schermo.
     *
     * Le quattro domande a foglietto stanno sopra a tutto perché nascono da
     * un tasto che è dentro a qualcos'altro. Erano scritte sotto le
     * finestre: col selettore dei segni aperto, un Esc chiudeva la finestra
     * di categorie e gruppi — quella sotto — e il selettore spariva insieme
     * a lei, lasciandoti due passi indietro rispetto a dove eri.
     */
    // prima l'ultimo aperto sopra a tutto, chiunque sia stato ad aprirlo
    const ultimo = this.#sopra.pop();
    if (ultimo) return ultimo(), true;
    if (this.sure) return (this.sure = null), true;
    if (this.mark) return (this.mark = null), true;
    if (this.color) return (this.color = null), true;
    if (this.pick) return (this.pick = null), true;
    if (this.paletteOpen) return (this.paletteOpen = false), true;
    if (this.modal) return this.closeModal(), true;
    if (this.picking) return (this.picking = false), true;
    return false;
  }
}

export const ui = new Ui();

/**
 * Il componente di una finestra che si scarica quando la si apre.
 *
 * Se la rete cade proprio allora lo si dice, e la finestra non si apre: una
 * finestra vuota direbbe che lì dentro non c'è niente.
 */
export async function scarica(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load: () => Promise<{ default: Component<any> }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Component<any> | null> {
  try {
    return (await load()).default;
  } catch {
    toast.show('Questa finestra non si è scaricata, forse perché la rete è caduta. Riprova fra poco.');
    return null;
  }
}

/**
 * Da dove è partita l'ultima cosa fatta: un tocco, un clic, un tasto.
 *
 * Serve a `openModal` per sapere se chi apre sta dentro la finestra
 * davanti. Il fuoco da solo non basta, perché un tasto premuto col dito su
 * un telefono non lo prende. E una voce scelta da un foglietto conta come
 * il tasto a cui il foglietto è attaccato: il foglietto sta fuori da tutto,
 * ma la domanda è nata lì.
 */
let tocco: Element | null = null;

function segna(event: Event): void {
  if (!(event.target instanceof Element)) return;
  const foglietto = event.target.closest('[data-pop]') ? (ui.sure ?? ui.pick ?? ui.mark ?? ui.color) : null;
  tocco = foglietto?.anchor ?? event.target;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', segna, true);
  window.addEventListener('keydown', segna, true);
}

/** Un elemento e quelli che lo contengono, dal più vicino al più lontano. */
function risalendo(from: Element): Element[] {
  const strada: Element[] = [];
  for (let one: Element | null = from; one; one = one.parentElement) strada.push(one);
  return strada;
}

/** Se il fuoco ci può andare: un tasto, un campo, o chi lo chiede con `tabindex`. */
function focalizzabile(one: Element): boolean {
  return one instanceof HTMLElement && one.tabIndex >= 0 && !one.hasAttribute('disabled') && !one.closest('[hidden]');
}

/** L'ultimo tocco se c'è ancora, se no quello che ha il fuoco. */
function daDove(): Element | null {
  if (tocco?.isConnected) return tocco;
  return typeof document !== 'undefined' ? document.activeElement : null;
}
