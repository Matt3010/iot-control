import type { Choice } from './table';
import type { Component } from 'svelte';
import { auth } from './auth.svelte';
import type { IconName } from './icons';
import { readJSON, writeJSON } from './storage';
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
  modal = $state<ModalRequest | null>(null);
  /** 'add' significa: ho premuto + , mettimi il cursore nel campo giusto. */
  manageIntent = $state<'browse' | 'add'>('browse');
  /** Vero finché la scheda di un luogo si è solo fatta da parte. */
  #placePaused = false;

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
    this.draft = draft;
    this.#placePaused = false;
    this.picking = false;
    if (!this.placeView) return;

    const suo = !draft.id || auth.canTouch(draft.id);
    this.openModal({
      title: !suo ? 'Luogo' : draft.id ? 'Modifica luogo' : 'Nuovo luogo',
      view: this.placeView,
      // farsi da parte per categorie e gruppi non è chiudere: la bozza resta
      // dov'è, e torna davanti quando quella finestra si chiude
      onclose: () => !this.#placePaused && this.closePlace(),
    });
  }

  closePlace(): void {
    this.draft = null;
    this.#placePaused = false;
    // solo se davanti c'è lei: chiudere un luogo mentre guardi categorie e
    // gruppi portava via quella finestra insieme al resto
    if (this.placeOpen) this.modal = null;
  }

  /** Quale delle due finestre è davanti, per chi deve saperlo. */
  get placeOpen(): boolean {
    return this.placeView !== null && this.modal?.view === this.placeView;
  }

  /**
   * One sheet at a time, but a draft in progress survives: you open this very
   * panel to create the category the place you are adding still needs.
   */
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
    // una sola finestra alla volta: la scheda di un luogo aperta si fa da
    // parte, e la sua bozza resta dov'è per essere ripresa dopo
    this.#placePaused = this.draft !== null;
    this.#tab = tab;
    this.manageIntent = intent;
    this.#ricorda();
    // e si vede dentro a una finestra, che di cosa ci sia dentro non sa niente
    if (this.manageView) {
      this.openModal({
        title: 'Categorie e gruppi',
        view: this.manageView,
        /* Chiusa la finestra, anche la scheda dietro deve risultare chiusa.
           Con Esc si chiudeva solo la finestra e lo stato restava su
           'manage': niente in mezzo allo schermo, ma l'applicazione si
           credeva con una scheda aperta, e il tasto che aggiunge un luogo
           spariva dietro a niente. */
        onclose: () => this.closeManage(),
      });
    }
  }

  closeManage(): void {
    this.mark = null;
    this.color = null;
    this.modal = null;

    const riprendi = this.#placePaused ? this.draft : null;
    this.#placePaused = false;
    this.#ricorda();
    // la scheda che si era fatta da parte torna davanti, con dentro la
    // categoria appena creata
    if (riprendi) this.openPlace(riprendi);
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
   */
  openModal(request: ModalRequest): void {
    const prima = this.modal;
    this.modal = request;
    // una finestra che ne rimpiazza un'altra: quella che se ne va ha le sue
    // cose da rimettere a posto come se l'avessi chiusa tu
    if (prima && prima !== request) prima.onclose?.();
  }

  closeModal(): void {
    const chiusa = this.modal;
    this.modal = null;
    chiusa?.onclose?.();
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
