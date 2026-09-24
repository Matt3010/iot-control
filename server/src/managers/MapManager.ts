import { impronta, INVITO_GIORNI, nuovoCodice, sembraCodice } from '../auth/invito.js';
import type { MapDto } from '../dto/map.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import type { Transaction } from '../persistence/db.js';
import { store } from '../persistence/db.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { EditorRepository, InviteRepository, withSharing } from '../repositories/ShareRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import type { PlaceMap, Scope, User } from '../types.js';
import { aCasa, soloPadrone } from './raggio.js';

/** Più di tanti inviti aperti su una mappa non servono: sono link, e se ne crea uno quando serve. */
const MAX_INVITI = 24;

/** Com'è un invito per chi apre il link, prima di entrare. */
export interface InviteLook {
  /** Se vale ancora, e se no perché. */
  stato: 'aperto' | 'usato' | 'scaduto' | 'revocato';
  /** Perché non vale più, detto per chi l'ha aperto. C'è solo se non vale. */
  detto?: string;
  mapName: string;
  ownerHandle: string;
}

/** Chi ha appena aperto un link: in casa di chi, e quale mappa. */
export interface Accepted {
  map: PlaceMap;
  ownerId: string;
  /** Se è entrato adesso. Falso se ci era già, e allora il link resta buono. */
  nuovo: boolean;
}

export class MapManager {
  /** Quelle che questa richiesta vede, e a casa propria anche chi ci lavora e gli inviti aperti. */
  list(scope: Scope): Promise<PlaceMap[]> {
    return store.transaction(async (tx) => {
      const maps = await new MapRepository(tx).findAllIn(scope);
      return aCasa(scope) ? withSharing(tx, maps) : maps;
    });
  }

  /** Una mappa del padrone, riletta con chi ci lavora: è quella che torna a chi la cambia. */
  async #una(tx: Transaction, id: string): Promise<PlaceMap> {
    const map = await new MapRepository(tx).findById(id);
    if (!map) throw notFound('mappa inesistente');
    return (await withSharing(tx, [map]))[0] as PlaceMap;
  }

  /**
   * Le chiavi le dà chi la mappa ce l'ha. Prima si guarda se la mappa si
   * vede, poi se tocca a te: a un ospite una mappa non sua resta un 404.
   */
  async #delPadrone(tx: Transaction, scope: Scope, id: string): Promise<void> {
    if (!(await new MapRepository(tx).within(scope, id))) throw notFound('mappa inesistente');
    soloPadrone(scope);
  }

  /** Un account senza mappe non esiste: la prima nasce da sola. */
  ensureOne(ownerId: string): Promise<PlaceMap> {
    return store.transaction(async (tx) => {
      const maps = new MapRepository(tx);
      return (await maps.findAllOf(ownerId))[0] ?? (await maps.insert(ownerId, 'La mia mappa'));
    });
  }

  /** Una mappa nuova la fa solo chi l'indice ce l'ha: un ospite e' ospite. */
  create(scope: Scope, dto: MapDto): Promise<PlaceMap> {
    if (!aCasa(scope)) throw notFound('mappa inesistente');
    return store.transaction(async (tx) => ({
      ...(await new MapRepository(tx).insert(scope.ownerId, dto.name)),
      editors: [],
      invites: [],
    }));
  }

  /** Il nome, e basta: chi ci lavora si cambia con gli inviti e con gli editor. */
  update(scope: Scope, id: string, dto: MapDto): Promise<PlaceMap> {
    return store.transaction(async (tx) => {
      const maps = new MapRepository(tx);
      if (!(await maps.within(scope, id))) throw notFound('mappa inesistente');
      const map = (await maps.update(id, { name: dto.name })) as PlaceMap;
      return aCasa(scope) ? this.#una(tx, id) : map;
    });
  }

  /** Cancellarla porta via i suoi posti, ma non l'ultima, e non da ospite. */
  remove(scope: Scope, id: string): Promise<{ removedPlaces: number }> {
    if (!aCasa(scope)) throw notFound('mappa inesistente');
    return store.transaction(async (tx) => {
      const maps = new MapRepository(tx);
      const ownerId = scope.ownerId;
      if (!(await maps.owns(ownerId, id))) throw notFound('mappa inesistente');
      if ((await maps.findAllOf(ownerId)).length <= 1) throw badRequest('una mappa deve restare');

      // solo la mappa e i suoi posti: i gruppi sono tuoi, come le categorie,
      // e restano anche quando la mappa dove li usavi non c'è più
      const removedPlaces = await new PlaceRepository(tx).deleteByMap(id);
      await maps.delete(id);
      return { removedPlaces };
    });
  }

  /**
   * Un link d'invito nuovo. Il codice torna qui una volta sola, e poi di lui
   * resta solo l'impronta: chi l'ha perso ne crea un altro.
   */
  invite(scope: Scope, id: string, label: string): Promise<{ map: PlaceMap; code: string }> {
    return store.transaction(async (tx) => {
      await this.#delPadrone(tx, scope, id);
      const invites = new InviteRepository(tx);
      if ((await invites.countOpen(id)) >= MAX_INVITI) {
        throw badRequest(`Su questa mappa ci sono già ${MAX_INVITI} inviti da aprire. Revocane uno prima di crearne un altro.`);
      }
      const code = nuovoCodice();
      await invites.insert({
        mapId: id,
        label,
        hash: impronta(code),
        expiresAt: new Date(Date.now() + INVITO_GIORNI * 24 * 60 * 60 * 1000),
      });
      return { map: await this.#una(tx, id), code };
    });
  }

  /** Un invito che non deve più valere, prima che qualcuno lo apra. */
  revoke(scope: Scope, id: string, inviteId: string): Promise<PlaceMap> {
    return store.transaction(async (tx) => {
      await this.#delPadrone(tx, scope, id);
      if (!(await new InviteRepository(tx).revoke(id, inviteId))) throw notFound('invito inesistente');
      return this.#una(tx, id);
    });
  }

  /**
   * Fin dove arriva un editor: tutta la mappa, o solo certi luoghi. Un
   * elenco vale solo per i luoghi che stanno su questa mappa: gli altri non
   * sono «vietati», semplicemente non c'entrano.
   */
  restrict(scope: Scope, id: string, userId: string, only: string[] | null): Promise<PlaceMap> {
    return store.transaction(async (tx) => {
      await this.#delPadrone(tx, scope, id);
      const suoi = new Set((await new PlaceRepository(tx).findAllOfMaps([id])).map((place) => place.id));
      const quali = only === null ? null : [...new Set(only)].filter((one) => suoi.has(one));
      if (!(await new EditorRepository(tx).restrict(id, userId, quali))) throw notFound('editor inesistente');
      return this.#una(tx, id);
    });
  }

  /** Toglie un editor: dalla richiesta dopo per lui la mappa non c'è più. */
  dropEditor(scope: Scope, id: string, userId: string): Promise<PlaceMap> {
    return store.transaction(async (tx) => {
      await this.#delPadrone(tx, scope, id);
      if (!(await new EditorRepository(tx).remove(id, userId))) throw notFound('editor inesistente');
      return this.#una(tx, id);
    });
  }

  /**
   * Cosa c'è dietro a un link, per chi lo apre prima di entrare: il nome
   * della mappa e di chi la tiene, e se vale ancora. Chi ha il link ha già
   * in mano il permesso di saperlo.
   */
  look(code: string): Promise<InviteLook> {
    return store.transaction(async (tx) => {
      const invite = sembraCodice(code) ? await new InviteRepository(tx).findByHash(impronta(code)) : undefined;
      if (!invite) throw notFound('Questo link d’invito non esiste. Controlla di averlo copiato intero.');
      const map = await new MapRepository(tx).findById(invite.mapId);
      const owner = map ? await new UserRepository(tx).findById(map.ownerId) : undefined;
      if (!map || !owner) throw notFound('La mappa di questo invito non c’è più.');
      const stato = statoDi(invite);
      return { stato, ...(stato === 'aperto' ? {} : { detto: perche(stato) }), mapName: map.name, ownerHandle: owner.handle };
    });
  }

  /**
   * Chi ha aperto il link entra nella mappa, legato al suo account.
   *
   * Chi ci era già entra senza consumare il link, che resta buono per chi
   * doveva riceverlo. Il padrone non si invita da solo.
   */
  accept(code: string, user: User): Promise<Accepted> {
    return store.transaction(async (tx) => {
      const invites = new InviteRepository(tx);
      const hash = sembraCodice(code) ? impronta(code) : '';
      const invite = hash ? await invites.findByHash(hash) : undefined;
      if (!invite) throw notFound('Questo link d’invito non esiste. Controlla di averlo copiato intero.');

      const map = await new MapRepository(tx).findById(invite.mapId);
      if (!map) throw notFound('La mappa di questo invito non c’è più.');
      if (map.ownerId === user.id) throw badRequest('Questo link l’hai creato tu, e la mappa è già tua. Mandalo a chi vuoi far entrare.');

      const editors = new EditorRepository(tx);
      if (await editors.has(map.id, user.id)) return { map, ownerId: map.ownerId, nuovo: false };

      // il turno sta nella scrittura: se torna vuota, qualcuno è arrivato prima o il link non vale più
      const preso = await invites.claim(hash, user.id);
      if (!preso) throw badRequest(perche(statoDi((await invites.findByHash(hash)) ?? invite)));
      await editors.add(map.id, user.id);
      return { map, ownerId: map.ownerId, nuovo: true };
    });
  }
}

function statoDi(invite: { usedAt: string | null; revokedAt: string | null; expiresAt: string }): InviteLook['stato'] {
  if (invite.revokedAt) return 'revocato';
  if (invite.usedAt) return 'usato';
  if (Date.parse(invite.expiresAt) <= Date.now()) return 'scaduto';
  return 'aperto';
}

/** Perché un link non vale più, detto a chi l'ha appena aperto. */
export function perche(stato: InviteLook['stato']): string {
  if (stato === 'usato') return 'Questo link d’invito è già stato usato. Chiedi a chi te l’ha mandato di crearne un altro.';
  if (stato === 'scaduto') return 'Questo link d’invito è scaduto. Chiedi a chi te l’ha mandato di crearne un altro.';
  if (stato === 'revocato') return 'Questo link d’invito è stato revocato da chi l’aveva creato.';
  return 'Questo link d’invito vale ancora.';
}

export const mapManager = new MapManager();
