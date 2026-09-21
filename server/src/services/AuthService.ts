import jwt from 'jsonwebtoken';
import { resolveSecret } from '../auth/secret.js';
import { config } from '../config.js';
import type { CredentialsDto } from '../dto/auth.dto.js';
import { userManager } from '../managers/UserManager.js';
import type { User } from '../types.js';

export interface UserView {
  id: string;
  email: string;
  createdAt: string;
}

export interface Session {
  user: UserView;
  token: string;
}

const toUserView = ({ id, email, createdAt }: User): UserView => ({ id, email, createdAt });

const sign = (user: User): string =>
  jwt.sign({ sub: user.id }, resolveSecret(), { expiresIn: `${config.auth.ttlDays}d` });

export class AuthService {
  /** Cosa deve sapere la schermata d'ingresso prima ancora di chiedere nulla. */
  async state(): Promise<{ needsSetup: boolean; signupOpen: boolean }> {
    const count = await userManager.count();
    return { needsSetup: count === 0, signupOpen: count === 0 || config.auth.allowSignup };
  }

  async register(dto: CredentialsDto): Promise<Session> {
    const { signupOpen } = await this.state();
    const user = await userManager.register(dto, signupOpen);
    return { user: toUserView(user), token: sign(user) };
  }

  async login(dto: CredentialsDto): Promise<Session> {
    const user = await userManager.authenticate(dto);
    return { user: toUserView(user), token: sign(user) };
  }

  me(user: User): UserView {
    return toUserView(user);
  }
}

export const authService = new AuthService();
