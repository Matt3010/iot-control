import { hashPassword, verifyPassword } from '../auth/password.js';
import type { CredentialsDto, RegisterDto } from '../dto/auth.dto.js';
import { badRequest } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
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
    return store.transaction((tx) => {
      const users = new UserRepository(tx);
      return new MapRepository(tx)
        .findEditableBy(email)
        .map((map) => ({ owner: users.findById(map.ownerId), map }))
        .filter((pair): pair is { owner: User; map: PlaceMap } => !!pair.owner);
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
    return store.transaction((tx) => {
      const owner = new UserRepository(tx).findByIdOrHandle(who);
      if (!owner || owner.email === email) return undefined;

      const maps = new MapRepository(tx);
      const mie = maps.findEditableOf(owner.id, email);
      if (!mie.length) return undefined;

      const regole = mie.map((map) => ({ map, rule: maps.ruleFor(map, email) }));
      const aperte = regole.some(({ rule }) => !rule?.only);
      if (aperte) return { ownerId: owner.id, maps: mie.map((map) => map.id), places: null };

      const places = new PlaceRepository(tx);
      const dentro = new Set(
        regole.flatMap(({ map, rule }) =>
          places
            .findAllOfMaps([map.id])
            .filter((place) => rule?.only?.includes(place.id))
            .map((place) => place.id),
        ),
      );
      return { ownerId: owner.id, maps: mie.map((map) => map.id), places: [...dentro] };
    });
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
