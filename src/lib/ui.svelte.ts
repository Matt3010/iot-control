import type { Draft } from './types';

export type Sheet = 'none' | 'place' | 'manage';
export type ManageTab = 'categories' | 'groups';

export interface EmojiRequest {
  anchor: HTMLElement;
  onPick: (emoji: string) => void;
}

export interface ColorRequest {
  anchor: HTMLElement;
  current: string;
  onPick: (color: string) => void;
}

/** Which panels are open, and what the place sheet is editing. */
class Ui {
  sheet = $state<Sheet>('none');
  manageTab = $state<ManageTab>('categories');
  draft = $state<Draft | null>(null);
  picking = $state(false);
  paletteOpen = $state(false);
  emoji = $state<EmojiRequest | null>(null);
  color = $state<ColorRequest | null>(null);
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
  openManage(tab: ManageTab = 'categories', intent: 'browse' | 'add' = 'browse'): void {
    this.panelWish = 'auto';
    this.#placePaused = this.sheet === 'place';
    this.manageTab = tab;
    this.manageIntent = intent;
    this.sheet = 'manage';
  }

  closeManage(): void {
    this.emoji = null;
    this.color = null;
    this.sheet = this.#placePaused && this.draft ? 'place' : 'none';
    this.#placePaused = false;
  }

  toggleManage(tab: ManageTab = 'categories', intent: 'browse' | 'add' = 'browse'): void {
    if (this.sheet === 'manage' && this.manageTab === tab) this.closeManage();
    else this.openManage(tab, intent);
  }

  setPicking(on: boolean): void {
    this.picking = on;
    if (on) this.closePlace();
  }

  askEmoji(anchor: HTMLElement, onPick: (emoji: string) => void): void {
    this.color = null;
    this.emoji = { anchor, onPick };
  }

  askColor(anchor: HTMLElement, current: string, onPick: (color: string) => void): void {
    this.emoji = null;
    this.color = { anchor, current, onPick };
  }

  /** Esc unwinds the overlay one layer at a time, topmost first. */
  escape(): boolean {
    if (this.paletteOpen) return (this.paletteOpen = false), true;
    if (this.color) return (this.color = null), true;
    if (this.emoji) return (this.emoji = null), true;
    if (this.picking) return (this.picking = false), true;
    if (this.sheet === 'place') return this.closePlace(), true;
    if (this.sheet === 'manage') return this.closeManage(), true;
    return false;
  }
}

export const ui = new Ui();
