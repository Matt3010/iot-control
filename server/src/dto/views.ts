import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { Agent, Category, Device, Group, MapEditor, Place, PlaceMap, Scene, SceneConditionGroup, SceneStep, SceneTrigger, Timing } from '../types.js';
import type { OwnerState } from '../managers/StateManager.js';
import { NESSUNA_CONDIZIONE } from '../types.js';

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
  /** Chi la può modificare oltre a chi ce l'ha, e con quali regole. */
  editors: MapEditor[];
  createdAt: string;
}

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
  /** Gli agenti appesi a questo luogo: nessuno, uno, o più se le reti sono separate. */
  agentIds: string[];
  createdAt: string;
}


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
  /** Se vuoi essere avvisato quando smette di rispondere. */
  watch?: boolean;
  /** Da quando l'agente non lo racconta più. */
  goneAt?: string;
}

/** Una scena come esce di qui: il nome, le righe, e quando parte da sola. */
export interface SceneView {
  id: string;
  name: string;
  steps: SceneStep[];
  when?: Timing;
  /** L'ultima volta che è partita, per metterle in fila per uso. */
  ranAt?: string;
  triggers: SceneTrigger[];
  only: SceneConditionGroup;
  /** Se sta andando adesso: a che momento, e quanto manca all'attesa di adesso. */
  corre?: { at: number; of: number; resta?: number };
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
  editors: map.editors ?? [],
  createdAt: map.createdAt,
});

export const toGroupView = ({ id, name }: Group): GroupView => ({ id, name });

export const toSceneView = ({ id, name, steps, when, ranAt, triggers, only }: Scene): SceneView => ({
  id,
  name,
  steps: steps ?? [],
  triggers: triggers ?? [],
  only: only ?? NESSUNA_CONDIZIONE,
  ...(ranAt ? { ranAt } : {}),
  // l'ultima partenza resta di qua: a chi guarda serve sapere quando parte,
  // non quando e' partita l'ultima volta — quello e' nel registro
  ...(when ? { when } : {}),
});

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
  agentIds: place.agentIds ?? [],
  createdAt: place.createdAt,
});

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
  // se vuoi che ti si dica quando tace: spento non si scrive
  ...(device.watch ? { watch: true } : {}),
  ...(device.goneAt ? { goneAt: device.goneAt } : {}),
});

export const toStateView = ({ maps, categories, groups, places }: OwnerState): StateView => ({
  maps: maps.map(toMapView),
  categories: categories.map(toCategoryView),
  groups: groups.map(toGroupView),
  places: places.map(toPlaceView),
});
