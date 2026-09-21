import { api, onUnauthorized } from './api';

export interface Account {
  id: string;
  email: string;
  /** Il nome nel link del profilo: /u/<handle>. */
  handle: string;
  /** Aperture, persone diverse, e quante hanno poi aperto una mappa. */
  profileViews: number;
  profileViewers: number;
  profileFollowed: number;
  createdAt: string;
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
