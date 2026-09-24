import { api, onUnauthorized } from './api';

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

  async load(): Promise<void> {
    try {
      this.account = await api.get<Account>('/auth/me');
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
