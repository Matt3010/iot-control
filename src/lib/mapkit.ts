import L, { type Marker, type MarkerCluster } from 'leaflet';
import 'leaflet.markercluster';
import { createElement } from 'lucide';
import { ICONS, type IconName } from './icons';

/**
 * Quello che serve per avere *questa* mappa e non una qualsiasi: gli stessi
 * tasselli, gli stessi controlli, gli stessi pin. Lo usano la mappa dell'app,
 * quella pubblica e lo sfondo della porta. Il vestito sta in styles/map.css.
 */

/** Tasselli OpenStreetMap: niente chiavi, niente terzi. Il colore è un filtro CSS. */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const DEFAULT_COLOR = '#6b7280';
export const DEFAULT_EMOJI = '📍';

/** Oltre questo zoom ogni marker sta per sé, quindi un popup può aprirsi. */
export const CLUSTER_OFF_AT = 17;

/** Un'icona di lucide come elemento, per quando il markup non è di Svelte. */
export function glyph(name: IconName): SVGElement {
  const svg = createElement(ICONS[name]);
  svg.setAttribute('class', 'ico');
  return svg;
}

/** La mappa con cui si lavora: i controlli in basso a sinistra, l'angolo destro libero. */
export function createMap(container: HTMLElement, options: L.MapOptions = {}): L.Map {
  const map = L.map(container, { zoomControl: false, attributionControl: false, ...options });
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
  return map;
}

/** La stessa mappa, ma solo da guardare: nessun controllo, nessun gesto. */
export function stillMap(container: HTMLElement, options: L.MapOptions = {}): L.Map {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
    ...options,
  });
  L.tileLayer(TILES, { maxZoom: 19 }).addTo(map);
  return map;
}

export interface PinLook {
  color?: string;
  emoji?: string;
  /** Classi in più sul pin: 'draft' mentre lo stai posando. */
  extra?: string;
  /** Un posto privato lo si riconosce dalla mappa, senza aprirlo. */
  locked?: boolean;
}

export function pinIcon({ color, emoji, extra = '', locked = false }: PinLook): L.DivIcon {
  const lock = locked ? `<i class="pin-lock">${glyph('lock').outerHTML}</i>` : '';
  return L.divIcon({
    className: '',
    html:
      `<div class="pin ${extra}" style="--c:${color ?? DEFAULT_COLOR}">` +
      `<span>${emoji ?? DEFAULT_EMOJI}</span>${lock}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  });
}

/** Il marker si porta dietro il suo posto: al grappolo servono i colori. */
export type Coloured = { colour: string };

/** Un grappolo veste i colori di quello che nasconde: un arco per categoria. */
function clusterIcon(cluster: MarkerCluster): L.DivIcon {
  const children = cluster.getAllChildMarkers();
  const tally = new Map<string, number>();
  for (const marker of children) {
    const colour = (marker.options as Partial<Coloured>).colour ?? DEFAULT_COLOR;
    tally.set(colour, (tally.get(colour) ?? 0) + 1);
  }

  let at = 0;
  const stops: string[] = [];
  for (const [colour, count] of tally) {
    const end = at + (count / children.length) * 100;
    stops.push(`${colour} ${at}% ${end}%`);
    at = end;
  }

  return L.divIcon({
    className: '',
    html: `<div class="cluster" style="background:conic-gradient(${stops.join(',')})"><span>${children.length}</span></div>`,
    iconSize: [44, 44],
  });
}

export function clusterGroup(): L.MarkerClusterGroup {
  return L.markerClusterGroup({
    maxClusterRadius: 54,
    disableClusteringAtZoom: CLUSTER_OFF_AT,
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    iconCreateFunction: clusterIcon,
  });
}

/** Un marker che il grappolo sa colorare. */
export function pin(lat: number, lng: number, look: PinLook, extra: L.MarkerOptions = {}): Marker {
  return L.marker([lat, lng], {
    icon: pinIcon(look),
    colour: look.color ?? DEFAULT_COLOR,
    ...extra,
  } as L.MarkerOptions);
}
