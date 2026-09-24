import type { MapDto } from '../dto/map.dto.js';
import type { MapView } from '../dto/views.js';
import { toMapView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { mapManager, type Accepted, type InviteLook } from '../managers/MapManager.js';
import { casaDi } from '../managers/raggio.js';
import type { PlaceMap, Scope, User } from '../types.js';

/** Il link completo: è l'unica volta che il codice esce di qui. */
const linkOf = (origin: string, code: string): string => `${origin}/invito/${code}`;

export class MapService {
  async list(scope: Scope): Promise<MapView[]> {
    return (await mapManager.list(scope)).map(toMapView);
  }

  /**
   * Com'è la mappa dopo, a tutte le schede aperte sull'indice. Agli ospiti
   * il filo la manda senza chi ci lavora (`StateController`).
   */
  #detto(ownerId: string, map: PlaceMap): MapView {
    const view = toMapView(map);
    hub.changed(ownerId, { kind: 'map', id: view.id, value: view });
    return view;
  }

  async create(scope: Scope, dto: MapDto): Promise<MapView> {
    return this.#detto(scope.ownerId, await mapManager.create(scope, dto));
  }

  async update(scope: Scope, id: string, dto: MapDto): Promise<MapView> {
    return this.#detto(scope.ownerId, await mapManager.update(scope, id, dto));
  }

  /**
   * Una mappa si porta via i suoi luoghi. Di quelli non si manda un evento
   * ciascuno: chi guarda sa già che una mappa che se ne va se li porta dietro,
   * ed è la stessa regola che applica quando è lui a eliminarla.
   */
  async remove(scope: Scope, id: string): Promise<{ removedPlaces: number }> {
    const done = await mapManager.remove(scope, id);
    hub.changed(scope.ownerId, { kind: 'map', id, value: null });
    return done;
  }

  /** Un link d'invito nuovo, completo: si vede qui e mai più. */
  async invite(scope: Scope, id: string, label: string, origin: string): Promise<{ map: MapView; link: string }> {
    const { map, code } = await mapManager.invite(scope, id, label);
    return { map: this.#detto(scope.ownerId, map), link: linkOf(origin, code) };
  }

  async revoke(scope: Scope, id: string, inviteId: string): Promise<MapView> {
    return this.#detto(scope.ownerId, await mapManager.revoke(scope, id, inviteId));
  }

  async restrict(scope: Scope, id: string, userId: string, only: string[] | null): Promise<MapView> {
    return this.#detto(scope.ownerId, await mapManager.restrict(scope, id, userId, only));
  }

  /**
   * Un editor che se ne va. Lo sanno le schede del padrone, e anche le sue:
   * nelle sue la porta di questa mappa non c'è più.
   */
  async dropEditor(scope: Scope, id: string, userId: string): Promise<MapView> {
    const view = this.#detto(scope.ownerId, await mapManager.dropEditor(scope, id, userId));
    hub.changed(userId, { kind: 'account' });
    return view;
  }

  look(code: string): Promise<InviteLook> {
    return mapManager.look(code);
  }

  /**
   * Chi apre il link entra. Il padrone vede comparire il suo nome fra chi ci
   * lavora, e le altre schede di chi è entrato la porta nuova.
   */
  async accept(code: string, user: User): Promise<Accepted> {
    const fatto = await mapManager.accept(code, user);
    if (fatto.nuovo) {
      const [map] = await mapManager.list(casaDi(fatto.ownerId)).then((all) =>
        all.filter((one) => one.id === fatto.map.id),
      );
      if (map) this.#detto(fatto.ownerId, map);
      hub.changed(user.id, { kind: 'account' });
    }
    return fatto;
  }
}

export const mapService = new MapService();
