import { api, onUnauthorized } from './api';

export interface Account {
  id: string;
  email: string;
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

  async enter(email: string, password: string, mode: 'login' | 'register'): Promise<void> {
    const path = mode === 'register' ? '/auth/register' : '/auth/login';
    this.account = await api.post<Account>(path, { email, password });
    this.needsSetup = false;
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
