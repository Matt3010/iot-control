import jwt from 'jsonwebtoken';
import { resolveSecret } from '../auth/secret.js';
import { config } from '../config.js';
import type { CredentialsDto, RegisterDto } from '../dto/auth.dto.js';
import { mapManager } from '../managers/MapManager.js';
import { userManager } from '../managers/UserManager.js';
import type { User } from '../types.js';

/** Un indice di qualcun altro, come lo si nomina da fuori. */
export interface IndexRef {
  ownerId: string;
  handle: string;
  email: string;
}

export interface UserView {
  id: string;
  email: string;
  handle: string;
  /** Chi può modificare il mio indice come me. */
  collaborators: string[];
  /** Gli indici di altri in cui posso entrare: chi mi ha dato le chiavi. */
  shared: IndexRef[];
  /** Dentro quale ci sono adesso, se non sono a casa mia. */
  actingAs: IndexRef | null;
  /** Quante volte hanno aperto il tuo /u/<handle>. */
  profileViews: number;
  /** Quante persone diverse, contate una volta al giorno. */
  profileViewers: number;
  /** Di quelle, quante hanno poi aperto una delle tue mappe. */
  profileFollowed: number;
  createdAt: string;
}

export interface Session {
  user: UserView;
  token: string;
}

const refOf = (user: User): IndexRef => ({
  ownerId: user.id,
  handle: user.handle,
  email: user.email,
});

const toUserView = (user: User): UserView => ({
  id: user.id,
  email: user.email,
  handle: user.handle,
  collaborators: user.collaborators ?? [],
  shared: [],
  actingAs: null,
  profileViews: user.profileViews ?? 0,
  profileViewers: user.profileViewers ?? 0,
  profileFollowed: user.profileFollowed ?? 0,
  createdAt: user.createdAt,
});

const sign = (user: User): string =>
  jwt.sign({ sub: user.id }, resolveSecret(), { expiresIn: `${config.auth.ttlDays}d` });

export class AuthService {
  /** Cosa deve sapere la schermata d'ingresso prima ancora di chiedere nulla. */
  async state(): Promise<{ needsSetup: boolean; signupOpen: boolean }> {
    const count = await userManager.count();
    return { needsSetup: count === 0, signupOpen: count === 0 || config.auth.allowSignup };
  }

  async register(dto: RegisterDto): Promise<Session> {
    const { signupOpen } = await this.state();
    const user = await userManager.register(dto, signupOpen);
    // Si entra e c'è già una mappa: nessuno deve inventarsi da dove partire.
    await mapManager.ensureOne(user.id);
    return { user: await this.me(user), token: sign(user) };
  }

  async login(dto: CredentialsDto): Promise<Session> {
    const user = await userManager.authenticate(dto);
    await mapManager.ensureOne(user.id);
    return { user: await this.me(user), token: sign(user) };
  }

  /**
   * Chi sei, cosa hai aperto agli altri, e cosa gli altri hanno aperto a te.
   * `actingOwnerId` è dove ti trovi adesso: si ricontrolla contro l'elenco
   * vero, così un cookie vecchio non racconta un permesso che non c'è più.
   */
  async me(user: User, actingOwnerId?: string): Promise<UserView> {
    const shared = (await userManager.sharedWith(user.email)).map(refOf);
    return {
      ...toUserView(user),
      shared,
      actingAs: shared.find((one) => one.ownerId === actingOwnerId) ?? null,
    };
  }

  /** Aggiornare chi ha le chiavi del mio: le mie, non quelle di dove mi trovo. */
  async share(user: User, emails: string[]): Promise<UserView> {
    return this.me(await userManager.setCollaborators(user.id, emails));
  }
}

export const authService = new AuthService();
