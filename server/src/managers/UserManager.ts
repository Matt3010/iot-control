import { hashPassword, verifyPassword } from '../auth/password.js';
import type { CredentialsDto, RegisterDto } from '../dto/auth.dto.js';
import { badRequest } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
import { UserRepository } from '../repositories/UserRepository.js';
import type { User } from '../types.js';

export class UserManager {
  findById(id: string): Promise<User | undefined> {
    return store.transaction((tx) => new UserRepository(tx).findById(id));
  }

  count(): Promise<number> {
    return store.transaction((tx) => new UserRepository(tx).count());
  }

  /**
   * Il primo che arriva prende l'indice. Dopo, altri account si aprono solo
   * se chi ospita l'app lo consente.
   */
  async register(dto: RegisterDto, opened: boolean): Promise<User> {
    const { salt, hash } = await hashPassword(dto.password);

    return store.transaction((tx) => {
      const users = new UserRepository(tx);
      if (users.count() > 0 && !opened) throw badRequest('le iscrizioni sono chiuse');
      if (users.findByEmail(dto.email)) throw badRequest('questa email è già registrata');
      // il nome lo scegli tu, quindi se è preso te lo diciamo invece di cambiartelo
      if (users.findByHandle(dto.handle)) throw badRequest('questo nome utente è già preso');
      return users.insert({ email: dto.email, handle: dto.handle, salt, hash });
    });
  }

  /** Stesso messaggio per email sconosciuta e password errata: non si aiuta chi prova. */
  async authenticate(dto: CredentialsDto): Promise<User> {
    const user = await store.transaction((tx) => new UserRepository(tx).findByEmail(dto.email));
    const ok = user ? await verifyPassword(dto.password, user.salt, user.hash) : false;
    if (!user || !ok) throw badRequest('email o password non corrette');
    return user;
  }
}

export const userManager = new UserManager();
