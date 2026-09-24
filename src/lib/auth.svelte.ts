import { api, onUnauthorized } from './api';
import { fusoDelBrowser } from './fuso';

/** Una mappa di qualcun altro che posso modificare, e chi la tiene. */
export interface KeyRef {
  ownerId: string;
  handle: string;
  mapId: string;
  mapName: string;
}

export interface Account {
  id: string;
  email: string;
  /** Il nome con cui ti vedi scritto nell'app: @tu. */
  handle: string;
  createdAt: string;
  /** Le mappe di altri che posso modificare: chi mi ha dato la chiave. */
  keys: KeyRef[];
  /**
   * In casa di chi sto lavorando adesso, se non è la mia — e fin dove arrivo.
   * `places: null` vuol dire tutti quelli delle mappe che posso toccare; un
   * elenco vuol dire soltanto quelli.
   */
  actingAs: { ownerId: string; handle: string; places: string[] | null } | null;
  /** Il fuso delle sue ore: le scene partono in questo, ovunque tu sia. */
  tz: string;
  /** Se l'ha già detto: finché no, lo dice il primo browser che entra. */
  tzSet: boolean;
}

interface Gate {
  needsSetup: boolean;
  signupOpen: boolean;
}

/** Chi è entrato, e cosa deve chiedere la porta a chi non lo è ancora. */
class Auth {
  account = $state<Account | null>(null);
  needsSetup = $state(false);
  signupOpen = $state(false);
  /** Finché non sappiamo chi c'è non si mostra né l'app né la porta. */
  checking = $state(true);

  constructor() {
    onUnauthorized(() => {
      this.account = null;
    });
  }

  /** Se sto lavorando in casa d'altri: certe cose lì dentro non si toccano. */
  get guest(): boolean {
    return !!this.account?.actingAs;
  }

  /**
   * E le mappe, posso farne e disfarne?
   *
   * Solo a casa mia. Una mappa nuova nascerebbe fuori da quelle che mi hanno
   * aperto, e una eliminata porterebbe via i luoghi di qualcun altro: il
   * server dice di no a tutti e due, e un tasto che porta a un no non si
   * mostra.
   */
  get canMaps(): boolean {
    return !this.account?.actingAs;
  }

  /**
   * E gli agenti, posso amministrarli?
   *
   * Solo a casa mia: crearli, rinominarli, eliminarli, rigenerarne il token,
   * collegarci un account, togliere un dispositivo sparito. Da ospite si
   * accendono le luci degli agenti dei luoghi aperti a me, e ci si scrivono
   * scene e avvisi, ma la casa resta di chi la possiede: il server lo
   * rifiuta, e un tasto che porta a un no non si mostra.
   */
  get canAdmin(): boolean {
    return !this.account?.actingAs;
  }

  /**
   * E un luogo nuovo?
   *
   * A casa mia sì, e da ospite solo se mi hanno aperto la mappa intera: chi
   * è limitato a certi pin non ne crea, perché quello nuovo nascerebbe fuori
   * dal suo elenco e non potrebbe nemmeno correggerlo un attimo dopo.
   */
  get canAdd(): boolean {
    const acting = this.account?.actingAs;
    return !acting || acting.places === null;
  }

  /**
   * Questo luogo, posso toccarlo?
   *
   * A casa mia sempre. In casa d'altri dipende da cosa mi hanno aperto: tutta
   * la mappa, o certi pin. Il server rifiuta comunque — questo serve a non
   * offrire un tasto che porterebbe a un no.
   */
  canTouch(placeId: string): boolean {
    const acting = this.account?.actingAs;
    if (!acting) return true;
    return acting.places === null || acting.places.includes(placeId);
  }

  /** Il fuso in cui leggere le ore: quello dell'account, o del browser se non c'è. */
  get tz(): string {
    return this.account?.tz ?? fusoDelBrowser();
  }

  /**
   * La prima volta, il fuso lo dice il browser.
   *
   * Uno solo e poi basta: chi apre l'app in viaggio non deve spostare
   * l'orario delle scene di casa. Da lì in poi si cambia dalla pagina
   * dell'account.
   */
  async #fuso(): Promise<void> {
    if (!this.account || this.account.tzSet) return;
    await this.update({ tz: fusoDelBrowser() }).catch(() => undefined);
  }

  /** Cambia nome utente o fuso. Torna l'account com'è dopo. */
  async update(patch: { handle?: string; tz?: string }): Promise<void> {
    this.account = await api.patch<Account>('/auth/me', patch);
  }

  async changePassword(current: string, next: string): Promise<void> {
    await api.put('/auth/password', { current, next });
  }

  async load(): Promise<void> {
    try {
      this.account = await api.get<Account>('/auth/me');
      void this.#fuso();
    } catch {
      this.account = null;
      const gate = await api.get<Gate>('/auth/state').catch(() => null);
      if (gate) {
        this.needsSetup = gate.needsSetup;
        this.signupOpen = gate.signupOpen;
      }
    } finally {
      this.checking = false;
    }
  }

  async enter(
    email: string,
    password: string,
    mode: 'login' | 'register',
    handle?: string,
  ): Promise<void> {
    const path = mode === 'register' ? '/auth/register' : '/auth/login';
    const body = mode === 'register' ? { email, password, handle } : { email, password };
    this.account = await api.post<Account>(path, body);
    this.needsSetup = false;
    void this.#fuso();
  }

  /**
   * I conteggi delle visite arrivano con l'account, e cambiano mentre l'app è
   * aperta: quando vai a guardarli, prima si rileggono.
   */
  async refresh(): Promise<void> {
    const fresh = await api.get<Account>('/auth/me').catch(() => null);
    if (fresh) this.account = fresh;
  }

  /**
   * Entrare nell'indice di qualcuno, o tornare al proprio.
   *
   * Dopo si ricarica la pagina invece di rimettere a posto i pezzi uno per
   * uno: cambia tutto — i luoghi, le categorie, gli agenti, il filo aperto, e
   * perfino quale mappa questo browser si ricordava di guardare. Rileggere è
   * più corto che rammendare, e non lascia in giro niente del posto di prima.
   */
  async goInto(handle: string): Promise<void> {
    await api.post('/auth/act', { handle });
    window.location.assign('/');
  }

  /**
   * Accettare un link d'invito: si diventa editor di quella mappa e ci si
   * entra. Come per `goInto`, dopo si ricarica da capo, dentro all'indice
   * di chi ha mandato il link.
   */
  async acceptInvite(code: string): Promise<void> {
    await api.post(`/invites/${code}`, {});
    window.location.assign('/');
  }

  async comeBack(): Promise<void> {
    await api.delete('/auth/act');
    window.location.assign('/');
  }

  async leave(): Promise<void> {
    await api.post('/auth/logout', {}).catch(() => undefined);
    this.account = null;
    const gate = await api.get<Gate>('/auth/state').catch(() => null);
    if (gate) {
      this.needsSetup = gate.needsSetup;
      this.signupOpen = gate.signupOpen;
    }
  }
}

export const auth = new Auth();
