import type { Component } from 'svelte';
import { readJSON, writeJSON } from './storage';
import type { Draft } from './types';

export type Sheet = 'none' | 'place' | 'manage';
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
  /** Le voci, già in ordine di come vanno lette. */
  options: { id: string; label: string; note?: string }[];
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
  disabled?: boolean;
  /**
   * Cosa fa. Torna `false` per lasciarla aperta — serve quando quello che
   * hai scritto non va bene e la finestra deve dirtelo restando dov'è.
   */
  onpick: () => boolean | void | Promise<boolean | void>;
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
  aperta: boolean;
  tab: ManageTab;
}
const ricordo = readJSON<Ricordo>(RICORDO, { aperta: false, tab: 'categories' });

/** Which panels are open, and what the place sheet is editing. */
class Ui {
  sheet = $state<Sheet>(ricordo.aperta ? 'manage' : 'none');
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
  /**
   * Su schermo stretto il pannello e una scheda non ci stanno insieme:
   * 'auto' lo fa ridurre quando serve, le altre due sono scelte tue.
   */
  panelWish = $state<'auto' | 'open' | 'closed'>('auto');
  /** 'add' significa: ho premuto + , mettimi il cursore nel campo giusto. */
  manageIntent = $state<'browse' | 'add'>('browse');
  /** True while the place sheet is only stepping aside for the manage sheet. */
  #placePaused = false;

  openPlace(draft: Draft): void {
    this.panelWish = 'auto';
    this.draft = draft;
    this.#placePaused = false;
    this.picking = false;
    this.sheet = 'place';
  }

  closePlace(): void {
    this.draft = null;
    this.#placePaused = false;
    if (this.sheet === 'place') this.sheet = 'none';
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

  openManage(tab: ManageTab = 'categories', intent: 'browse' | 'add' = 'browse'): void {
    this.panelWish = 'auto';
    this.#placePaused = this.sheet === 'place';
    this.#tab = tab;
    this.manageIntent = intent;
    this.sheet = 'manage';
    this.#ricorda();
    // e si vede dentro a una finestra, che di cosa ci sia dentro non sa niente
    if (this.manageView) this.openModal({ title: 'Categorie e gruppi', view: this.manageView });
  }

  closeManage(): void {
    this.mark = null;
    this.color = null;
    this.modal = null;
    this.sheet = this.#placePaused && this.draft ? 'place' : 'none';
    this.#placePaused = false;
    this.#ricorda();
  }

  toggleManage(tab: ManageTab = 'categories', intent: 'browse' | 'add' = 'browse'): void {
    if (this.sheet === 'manage' && this.manageTab === tab) this.closeManage();
    else this.openManage(tab, intent);
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
    this.modal = request;
  }

  closeModal(): void {
    this.modal = null;
  }

  /** Questo browser e basta: quale scheda era aperta, e su quale linguetta. */
  #ricorda(): void {
    writeJSON(RICORDO, { aperta: this.sheet === 'manage', tab: this.#tab });
  }

  /** Esc unwinds the overlay one layer at a time, topmost first. */
  escape(): boolean {
    if (this.sure) return (this.sure = null), true;
    if (this.modal) return this.closeModal(), true;
    if (this.pick) return (this.pick = null), true;
    if (this.paletteOpen) return (this.paletteOpen = false), true;
    if (this.color) return (this.color = null), true;
    if (this.mark) return (this.mark = null), true;
    if (this.picking) return (this.picking = false), true;
    if (this.sheet === 'place') return this.closePlace(), true;
    if (this.sheet === 'manage') return this.closeManage(), true;
    return false;
  }
}

export const ui = new Ui();
