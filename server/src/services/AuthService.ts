import jwt from 'jsonwebtoken';
import { resolveSecret } from '../auth/secret.js';
import { config } from '../config.js';
import type { CredentialsDto, RegisterDto } from '../dto/auth.dto.js';
import { mapManager } from '../managers/MapManager.js';
import { userManager } from '../managers/UserManager.js';
import type { User } from '../types.js';

export interface UserView {
  id: string;
  email: string;
  handle: string;
  createdAt: string;
}

export interface Session {
  user: UserView;
  token: string;
}

const toUserView = ({ id, email, handle, createdAt }: User): UserView => ({ id, email, handle, createdAt });

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
    return { user: toUserView(user), token: sign(user) };
  }

  async login(dto: CredentialsDto): Promise<Session> {
    const user = await userManager.authenticate(dto);
    await mapManager.ensureOne(user.id);
    return { user: toUserView(user), token: sign(user) };
  }

  me(user: User): UserView {
    return toUserView(user);
  }
}

export const authService = new AuthService();
