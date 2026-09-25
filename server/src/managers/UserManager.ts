import { hashPassword, verifyNobody, verifyPassword } from '../auth/password.js';
import type { AccountDto, CredentialsDto, PasswordDto, RegisterDto } from '../dto/auth.dto.js';
import { badRequest } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { EditorRepository } from '../repositories/ShareRepository.js';
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
   * Le mappe aperte a questo account, con il nome di chi le tiene. È
   * l'elenco delle porte che qualcuno mi ha lasciato aperte.
   */
  keysOf(userId: string): Promise<{ owner: User; map: PlaceMap }[]> {
    return store.transaction(async (tx) => {
      const maps = await new EditorRepository(tx).mapsOf(userId);
      // i padroni tutti insieme: erano una domanda per mappa aperta
      const chi = await new UserRepository(tx).findMany(maps.map(({ map }) => map.ownerId));

      return maps.flatMap(({ map }) => {
        const owner = chi.get(map.ownerId);
        return owner ? [{ owner, map }] : [];
      });
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
  reachOf(who: string, userId: string): Promise<Scope | undefined> {
    return store.transaction(async (tx) => {
      const owner = await new UserRepository(tx).findByIdOrHandle(who);
      if (!owner || owner.id === userId) return undefined;

      const mie = await new EditorRepository(tx).mapsOf(userId, owner.id);
      if (!mie.length) return undefined;

      const ids = mie.map(({ map }) => map.id);
      if (mie.some(({ only }) => !only)) return { ownerId: owner.id, maps: ids, places: null };

      // i luoghi di tutte le mappe in una domanda, e poi si smistano
      const tutti = await new PlaceRepository(tx).findAllOfMaps(ids);
      const regoleDi = new Map(mie.map(({ map, only }) => [map.id, only]));

      const dentro = tutti.filter((place) => regoleDi.get(place.mapId)?.includes(place.id)).map((place) => place.id);
      return { ownerId: owner.id, maps: ids, places: [...new Set(dentro)] };
    });
  }

  /**
   * Il primo che arriva prende l'indice. Dopo, altri account si aprono solo
   * se chi ospita l'app lo consente: chi chiama lo sa già e non arriva fin
   * qui a iscrizioni chiuse, e qui si ricontrolla nella stessa transazione
   * che scrive, per chi si iscrive nello stesso istante del primo.
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

  /**
   * Cambia nome e fuso. Il nome è di tutti quelli che ti vedono scritto, quindi
   * se è di un altro te lo diciamo invece di cambiartelo in qualcosa di simile.
   */
  update(id: string, dto: AccountDto): Promise<User> {
    return store.transaction(async (tx) => {
      const users = new UserRepository(tx);
      if (dto.handle) {
        const chi = await users.findByHandle(dto.handle);
        if (chi && chi.id !== id) throw badRequest('questo nome utente è già preso');
      }
      const dopo = await users.update(id, {
        ...(dto.handle ? { handle: dto.handle } : {}),
        // nella sua forma di sempre, «Europe/Rome»: `Intl` accetta anche le
        // minuscole, ma è così che si legge e così che lo scrivono gli altri
        ...(dto.tz ? { tz: new Intl.DateTimeFormat('en', { timeZone: dto.tz }).resolvedOptions().timeZone } : {}),
      });
      if (!dopo) throw badRequest('questo account non esiste più');
      return dopo;
    });
  }

  /**
   * Password nuova, solo con quella giusta di adesso, e le sessioni di prima
   * chiuse: chi cambia la password di solito lo fa perché qualcun altro la
   * sa. Torna l'account com'è dopo, con il numero di sessione nuovo.
   *
   * Una transazione sola, con la riga bloccata dal controllo alla
   * scrittura: due cambi insieme non si scavalcano, e il secondo deve
   * conoscere la password scritta dal primo.
   */
  changePassword(id: string, dto: PasswordDto): Promise<User> {
    return store.transaction(async (tx) => {
      const users = new UserRepository(tx);
      const user = await users.lockById(id);
      if (!user || !(await verifyPassword(dto.current, user.salt, user.hash))) {
        throw badRequest('la password di adesso non è quella giusta');
      }
      const { salt, hash } = await hashPassword(dto.next);
      const dopo = await users.setPassword(id, salt, hash);
      if (!dopo) throw badRequest('questo account non esiste più');
      return dopo;
    });
  }

  /** Esce da tutte le sessioni, in ogni browser: i token di prima smettono di valere. */
  closeSessions(id: string): Promise<User | undefined> {
    return store.transaction((tx) => new UserRepository(tx).closeSessions(id));
  }

  /**
   * Stesso messaggio per email sconosciuta e password errata: non si aiuta chi
   * prova. E lo stesso tempo, perché anche un'email che non c'è passa per una
   * derivata (`verifyNobody`).
   */
  async authenticate(dto: CredentialsDto): Promise<User | undefined> {
    const user = await store.transaction((tx) => new UserRepository(tx).findByEmail(dto.email));
    const ok = user ? await verifyPassword(dto.password, user.salt, user.hash) : await verifyNobody(dto.password);
    return user && ok ? user : undefined;
  }
}

export const userManager = new UserManager();
