import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { Agent, Category, Device, Group, Place, PlaceMap } from '../types.js';
import type { OwnerState } from '../managers/StateManager.js';

/** The shapes that leave the API: entities never go out untouched. */
export interface CategoryView {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface MapView {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  /** Quante volte è stato usato il suo link: lo vede solo chi la possiede. */
  views: number;
  /** Quante persone diverse, contate una volta al giorno. */
  viewers: number;
  /** Di quelle aperture, quante arrivavano dal profilo. */
  viewsFromProfile: number;
  /** Chi la può modificare oltre a chi ce l'ha: tutta, o niente. */
  editors: string[];
  createdAt: string;
}

/**
 * Quello che di una mappa può vedere un estraneo: i conteggi non sono suoi, e
 * nemmeno l'elenco di chi la può modificare — sono indirizzi di altre persone.
 */
export type PublicMapView = Omit<MapView, 'views' | 'viewers' | 'viewsFromProfile' | 'editors'>;

export interface GroupView {
  id: string;
  name: string;
}

export interface PlaceView {
  id: string;
  mapId: string;
  name: string;
  categoryId: string;
  groupIds: string[];
  lat: number;
  lng: number;
  note: string;
  private: boolean;
  /** Chiuso a chi ha la chiave della mappa: lo vede, ma non lo tocca. */
  locked: boolean;
  /** Gli agenti appesi a questo luogo: nessuno, uno, o più se le reti sono separate. */
  agentIds: string[];
  createdAt: string;
}

/**
 * Quello che di un posto può vedere un estraneo.
 *
 * Il legame con l'agente non esce mai: da fuori una mappa si guarda, e le
 * luci di casa d'altri non si toccano nemmeno per sbaglio. E nemmeno esce
 * `locked`: da fuori non si modifica niente comunque, quindi dire quali righe
 * sono chiuse sarebbe raccontare di una porta che li' non c'e'.
 */
export type PublicPlaceView = Omit<PlaceView, 'agentIds' | 'locked'>;

export interface AgentView {
  id: string;
  name: string;
  /** Collegata adesso, non "l'ultima volta che". */
  online: boolean;
  lastSeenAt: string | null;
  /** Quanti dispositivi racconta. */
  devices: number;
  createdAt: string;
}

export interface DeviceView {
  id: string;
  agentId: string;
  name: string;
  capabilities: Capability[];
  /** Adesso: arriva dalla memoria, non dal disco. */
  online: boolean;
  state: Record<string, DeviceValue>;
  lastSeenAt: string;
}

export interface StateView {
  maps: MapView[];
  categories: CategoryView[];
  groups: GroupView[];
  places: PlaceView[];
}

export const toCategoryView = ({ id, name, emoji, color }: Category): CategoryView => ({ id, name, emoji, color });

export const toMapView = (map: PlaceMap): MapView => ({
  id: map.id,
  name: map.name,
  slug: map.slug,
  published: map.published ?? false,
  views: map.views ?? 0,
  viewers: map.viewers ?? 0,
  viewsFromProfile: map.viewsFromProfile ?? 0,
  editors: map.editors ?? [],
  createdAt: map.createdAt,
});

export const toPublicMapView = (map: PlaceMap): PublicMapView => {
  const {
    views: _quante,
    viewers: _quanti,
    viewsFromProfile: _daDove,
    editors: _chiavi,
    ...outside
  } = toMapView(map);
  return outside;
};

export const toGroupView = ({ id, name }: Group): GroupView => ({ id, name });

/** The defaults here also carry records written before groups existed. */
export const toPlaceView = (place: Place): PlaceView => ({
  id: place.id,
  mapId: place.mapId,
  name: place.name,
  categoryId: place.categoryId,
  groupIds: place.groupIds ?? [],
  lat: place.lat,
  lng: place.lng,
  note: place.note ?? '',
  private: place.private ?? false,
  locked: place.locked === true,
  agentIds: place.agentIds ?? [],
  createdAt: place.createdAt,
});

export const toPublicPlaceView = (place: Place): PublicPlaceView => {
  const { agentIds: _agenti, locked: _chiuso, ...outside } = toPlaceView(place);
  return outside;
};

export const toAgentView = (agent: Agent, online: boolean, devices: number): AgentView => ({
  id: agent.id,
  name: agent.name,
  online,
  lastSeenAt: agent.lastSeenAt,
  devices,
  createdAt: agent.createdAt,
});

export const toDeviceView = (device: Device, live: { online: boolean; state: Record<string, DeviceValue> } | undefined): DeviceView => ({
  id: device.id,
  agentId: device.agentId,
  name: device.name,
  capabilities: device.capabilities,
  online: live?.online ?? false,
  state: live?.state ?? {},
  lastSeenAt: device.lastSeenAt,
});

export const toStateView = ({ maps, categories, groups, places }: OwnerState): StateView => ({
  maps: maps.map(toMapView),
  categories: categories.map(toCategoryView),
  groups: groups.map(toGroupView),
  places: places.map(toPlaceView),
});
