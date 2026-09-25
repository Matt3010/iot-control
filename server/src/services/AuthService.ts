import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { resolveSecret } from '../auth/secret.js';
import { config } from '../config.js';
import { chiudiSotto } from '../auth/sessioni.js';
import { detto, perEmail, perIndirizzo } from '../auth/tentativi.js';
import type { CredentialsDto, PasswordDto, RegisterDto } from '../dto/auth.dto.js';
import { badRequest, HttpError, tooMany } from '../errors/HttpError.js';
import { mapManager } from '../managers/MapManager.js';
import { userManager } from '../managers/UserManager.js';
import { DEFAULT_TZ, type Scope, type User } from '../types.js';

/** Una mappa di qualcun altro che posso modificare: la porta e chi la tiene. */
export interface KeyRef {
  ownerId: string;
  handle: string;
  mapId: string;
  mapName: string;
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
  /** Il fuso delle sue ore: sempre uno, anche se non l'ha ancora detto. */
  tz: string;
  /** Se l'ha detto lui, o è quello di partenza: il browser lo dice solo allora. */
  tzSet: boolean;
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
  tz: user.tz ?? DEFAULT_TZ,
  tzSet: !!user.tz,
  createdAt: user.createdAt,
});

/**
 * Il token porta chi sei e il numero delle tue sessioni di adesso (`v`). Si
 * controlla a ogni richiesta (`auth/strategy.ts`), e quando il numero sale —
 * password cambiata, «esci da tutte le sessioni» — questo smette di valere.
 */
const sign = (user: User): string =>
  jwt.sign({ sub: user.id, v: user.tokenVersion }, resolveSecret(), {
    expiresIn: `${config.auth.ttlDays}d`,
    // ogni token ha il suo id, perché uscendo da un browser si chiuda quello e basta
    jwtid: randomUUID(),
  });

/** Se da qui o per quell'email si deve ancora aspettare: lo si dice prima di fare qualunque conto. */
function aspetta(...attese: number[]): void {
  const ms = Math.max(0, ...attese);
  if (ms) throw tooMany(`Troppi tentativi sbagliati. Riprova fra ${detto(ms)}.`, ms);
}

export class AuthService {
  /** Cosa deve sapere la schermata d'ingresso prima ancora di chiedere nulla. */
  async state(): Promise<{ needsSetup: boolean; signupOpen: boolean }> {
    const count = await userManager.count();
    return { needsSetup: count === 0, signupOpen: count === 0 || config.auth.allowSignup };
  }

  /**
   * A iscrizioni chiuse si dice subito, prima della derivata della password:
   * farla lo stesso voleva dire lasciare a chiunque sessanta millisecondi di
   * lavoro del server per ogni richiesta, e per niente.
   *
   * Un'iscrizione rifiutata conta come uno sbaglio per l'indirizzo da cui
   * arriva. «Questa email è già registrata» dice che quell'email c'è, e va
   * detto: senza una posta con cui confermare l'iscrizione, chi ha già un
   * account e se l'è scordato non avrebbe altro modo di saperlo. Ma provarle
   * tutte per sapere chi è iscritto costa l'attesa che cresce.
   */
  async register(dto: RegisterDto, indirizzo: string): Promise<Session> {
    const { signupOpen } = await this.state();
    if (!signupOpen) throw badRequest('le iscrizioni sono chiuse');
    aspetta(perIndirizzo.attesa(indirizzo));
    const user = await userManager.register(dto, signupOpen).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 400) perIndirizzo.sbagliato(indirizzo);
      throw error;
    });
    // Si entra e c'è già una mappa: nessuno deve inventarsi da dove partire.
    await mapManager.ensureOne(user.id);
    return { user: await this.me(user), token: sign(user) };
  }

  /**
   * Entrare, se non si è sbagliato troppe volte di fila: per quell'email o da
   * quell'indirizzo (`auth/tentativi.ts`). Chi deve aspettare lo sa prima che
   * la password venga guardata, così un tentativo in attesa non costa niente
   * al server e non dice niente a chi prova.
   */
  async login(dto: CredentialsDto, indirizzo: string): Promise<Session> {
    aspetta(perEmail.attesa(dto.email), perIndirizzo.attesa(indirizzo));
    const user = await userManager.authenticate(dto);
    if (!user) {
      const ms = Math.max(perEmail.sbagliato(dto.email), perIndirizzo.sbagliato(indirizzo));
      throw badRequest(
        ms ? `Email o password non corrette. Prima di riprovare aspetta ${detto(ms)}.` : 'email o password non corrette',
      );
    }
    perEmail.riuscito(dto.email);
    await mapManager.ensureOne(user.id);
    return { user: await this.me(user), token: sign(user) };
  }

  /**
   * Password nuova: le sessioni di prima si chiudono, e questa riparte con un
   * token nuovo, così chi l'ha cambiata non deve rientrare. Anche la password
   * di adesso sbagliata conta come uno sbaglio per quell'account: chi ha
   * trovato un browser aperto non la indovina a raffica.
   */
  async changePassword(user: User, dto: PasswordDto): Promise<Session> {
    aspetta(perEmail.attesa(user.email));
    const dopo = await userManager.changePassword(user.id, dto).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 400) perEmail.sbagliato(user.email);
      throw error;
    });
    perEmail.riuscito(user.email);
    // i fili aperti con le sessioni di prima si chiudono, compreso quello di questa scheda, che si riapre col token nuovo
    chiudiSotto(dopo.id, dopo.tokenVersion);
    return { user: await this.me(dopo), token: sign(dopo) };
  }

  /** Fuori da tutte le sessioni, anche da questa: i token di prima e i fili aperti con loro. */
  async closeSessions(user: User): Promise<void> {
    const dopo = await userManager.closeSessions(user.id);
    if (dopo) chiudiSotto(dopo.id, dopo.tokenVersion);
  }

  /**
   * Chi sei, e quali mappe di altri ti hanno aperto. `actingOwnerId` è in casa
   * di chi ti trovi: si ricontrolla contro le chiavi vere, così un cookie
   * vecchio non racconta un permesso che non c'è più.
   */
  async me(user: User, acting?: Scope): Promise<UserView> {
    const keys: KeyRef[] = (await userManager.keysOf(user.id)).map(({ owner, map }) => ({
      ownerId: owner.id,
      handle: owner.handle,
      mapId: map.id,
      mapName: map.name,
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
