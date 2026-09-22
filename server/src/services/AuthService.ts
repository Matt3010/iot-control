import jwt from 'jsonwebtoken';
import { resolveSecret } from '../auth/secret.js';
import { config } from '../config.js';
import type { CredentialsDto, RegisterDto } from '../dto/auth.dto.js';
import { mapManager } from '../managers/MapManager.js';
import { userManager } from '../managers/UserManager.js';
import type { Scope, User } from '../types.js';

/** Una mappa di qualcun altro che posso modificare: la porta e chi la tiene. */
export interface KeyRef {
  ownerId: string;
  handle: string;
  mapId: string;
  mapName: string;
  slug: string;
}

export interface UserView {
  id: string;
  email: string;
  handle: string;
  /** Le mappe di altri che posso modificare: chi mi ha dato la chiave. */
  keys: KeyRef[];
  /**
   * In casa di chi mi trovo adesso, se non sono a casa mia — e fin dove
   * arrivo. `places: null` vuol dire tutti quelli delle mappe che posso
   * toccare; un elenco vuol dire soltanto quelli, e gli altri si guardano.
   */
  actingAs: { ownerId: string; handle: string; places: string[] | null } | null;
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

const toUserView = (user: User): UserView => ({
  id: user.id,
  email: user.email,
  handle: user.handle,
  keys: [],
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
   * Chi sei, e quali mappe di altri ti hanno aperto. `actingOwnerId` è in casa
   * di chi ti trovi: si ricontrolla contro le chiavi vere, così un cookie
   * vecchio non racconta un permesso che non c'è più.
   */
  async me(user: User, acting?: Scope): Promise<UserView> {
    const keys: KeyRef[] = (await userManager.keysOf(user.email)).map(({ owner, map }) => ({
      ownerId: owner.id,
      handle: owner.handle,
      mapId: map.id,
      mapName: map.name,
      slug: map.slug,
    }));
    const here = acting ? keys.find((key) => key.ownerId === acting.ownerId) : undefined;
    return {
      ...toUserView(user),
      keys,
      actingAs: here ? { ownerId: here.ownerId, handle: here.handle, places: acting?.places ?? null } : null,
    };
  }
}

export const authService = new AuthService();
