import { hashPassword, verifyPassword } from '../auth/password.js';
import type { CredentialsDto, RegisterDto } from '../dto/auth.dto.js';
import { badRequest } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import type { PlaceMap, Scope, User } from '../types.js';

export class UserManager {
  findById(id: string): Promise<User | undefined> {
    return store.transaction((tx) => new UserRepository(tx).findById(id));
  }

  count(): Promise<number> {
    return store.transaction((tx) => new UserRepository(tx).count());
  }

  /**
   * Le mappe aperte a questo indirizzo, con il nome di chi le tiene. È
   * l'elenco delle porte che qualcuno mi ha lasciato aperte.
   */
  keysOf(email: string): Promise<{ owner: User; map: PlaceMap }[]> {
    return store.transaction(async (tx) => {
      const users = new UserRepository(tx);
      const out: { owner: User; map: PlaceMap }[] = [];

      for (const map of await new MapRepository(tx).findEditableBy(email)) {
        const owner = await users.findById(map.ownerId);
        if (owner) out.push({ owner, map });
      }
      return out;
    });
  }

  /**
   * Il raggio d'azione di chi entra in casa d'altri: il padrone, le sue mappe
   * aperte a me, e — se me l'hanno ristretto — quali luoghi.
   *
   * I luoghi si contano adesso, non si portano dietro: una mappa che mi si
   * apre tutta vale per i pin che ha in questo momento, anche per quelli
   * aggiunti un minuto fa. Se anche una sola delle mie mappe è aperta tutta,
   * l'elenco non serve: `null` vuol dire «tutti quelli che posso vedere».
   */
  reachOf(who: string, email: string): Promise<Scope | undefined> {
    return store.transaction(async (tx) => {
      const owner = await new UserRepository(tx).findByIdOrHandle(who);
      if (!owner || owner.email === email) return undefined;

      const maps = new MapRepository(tx);
      const mie = await maps.findEditableOf(owner.id, email);
      if (!mie.length) return undefined;

      const regole = mie.map((map) => ({ map, rule: maps.ruleFor(map, email) }));
      const aperte = regole.some(({ rule }) => !rule?.only);
      if (aperte) return { ownerId: owner.id, maps: mie.map((map) => map.id), places: null };

      const places = new PlaceRepository(tx);
      const dentro = new Set<string>();
      for (const { map, rule } of regole) {
        for (const place of await places.findAllOfMaps([map.id])) {
          if (rule?.only?.includes(place.id)) dentro.add(place.id);
        }
      }
      return { ownerId: owner.id, maps: mie.map((map) => map.id), places: [...dentro] };
    });
  }

  /**
   * Il primo che arriva prende l'indice. Dopo, altri account si aprono solo
   * se chi ospita l'app lo consente.
   */
  async register(dto: RegisterDto, opened: boolean): Promise<User> {
    const { salt, hash } = await hashPassword(dto.password);

    return store.transaction(async (tx) => {
      const users = new UserRepository(tx);
      if ((await users.count()) > 0 && !opened) throw badRequest('le iscrizioni sono chiuse');
      if (await users.findByEmail(dto.email)) throw badRequest('questa email è già registrata');
      // il nome lo scegli tu, quindi se è preso te lo diciamo invece di cambiartelo
      if (await users.findByHandle(dto.handle)) throw badRequest('questo nome utente è già preso');
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
