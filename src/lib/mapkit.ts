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

/**
 * La mappa con cui si lavora: i controlli in basso a sinistra, l'angolo destro
 * libero. Con `onLocate` il tasto "dove sono" sta sopra allo zoom, come ci si
 * aspetta.
 */
export function createMap(
  container: HTMLElement,
  options: L.MapOptions = {},
  onLocate?: () => void,
): L.Map {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    // un mondo solo: niente copie affiancate, e niente vuoto oltre i poli
    maxBounds: WORLD,
    maxBoundsViscosity: 1,
    ...options,
  });
  L.tileLayer(TILES, { maxZoom: 19, noWrap: true, bounds: WORLD, attribution: ATTRIBUTION }).addTo(map);
  fillTheWindow(map, container);
  // l'angolo impila dal basso nell'ordine in cui si aggiungono: prima lo zoom,
  // poi il tasto, che così gli sta sopra
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  if (onLocate) locateControl(onLocate).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
  return map;
}

/** Il mondo intero, senza le calotte che la proiezione non sa disegnare. */
const WORLD = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));

/**
 * Sotto un certo zoom il mondo diventa più piccolo della finestra e intorno
 * resta il nero. Lo zoom minimo non è un numero fisso: è quello che serve a
 * coprire il lato più lungo di questa finestra, e cambia se la finestra cambia.
 */
function fillTheWindow(map: L.Map, container: HTMLElement): void {
  const fit = () => {
    const side = Math.max(container.clientWidth, container.clientHeight);
    const enough = Math.ceil(Math.log2(Math.max(side, 1) / 256));
    map.setMinZoom(Math.max(enough, 0));
  };
  fit();
  map.on('resize', fit);
}

/** Un tasto in mezzo ai controlli di Leaflet, con il loro stesso vestito. */
function locateControl(onLocate: () => void): L.Control {
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => {
    const wrap = L.DomUtil.create('div', 'leaflet-control locate');
    const button = L.DomUtil.create('a', '', wrap) as HTMLAnchorElement;
    button.href = '#';
    button.title = 'Dove sono';
    button.setAttribute('role', 'button');
    button.append(glyph('locate'));
    L.DomEvent.on(button, 'click', (event) => {
      L.DomEvent.stop(event);
      onLocate();
    });
    return wrap;
  };
  return control;
}

/** Quanti metri ci sono fra due punti, senza tirare in ballo una mappa. */
export function metersBetween(from: L.LatLngExpression, to: L.LatLngExpression): number {
  return L.latLng(from).distanceTo(to);
}

/** Il puntino di dove sei: non si clicca, sta sotto ai pin. */
export function meIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div class="me"><span class="me-dot"></span></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
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
  /** Quante cose si accendono qui. Zero non si scrive. */
  count?: number;
  /** Come stanno gli agenti: 'live', 'degraded', 'lost', 'new'. */
  health?: string;
}

/**
 * Il pin, e sopra un'etichetta sola con quello che c'è da sapere: come sta,
 * quanti agenti tiene, e se è privato.
 *
 * L'etichetta sta **fuori** dal pin e non dentro: il pin è ruotato di 45
 * gradi, e tutto quello che ci metti dentro va controruotato uno per uno.
 * Con tre cose in fila diventa un rebus — meglio una pastiglia dritta,
 * appoggiata sopra.
 */
export function pinIcon({
  color,
  emoji,
  extra = '',
  locked = false,
  count = 0,
  health,
}: PinLook): L.DivIcon {
  const parts = [
    health ? `<b class="pin-health is-${health}"></b>` : '',
    count > 0 ? `<em>${count}</em>` : '',
    locked ? glyph('lock').outerHTML : '',
  ].join('');

  const tag = parts ? `<i class="pin-tag">${parts}</i>` : '';

  return L.divIcon({
    className: '',
    html:
      `<div class="pin-wrap">` +
      `<div class="pin ${extra}" style="--c:${color ?? DEFAULT_COLOR}"><span>${emoji ?? DEFAULT_EMOJI}</span></div>` +
      `${tag}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -40],
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

  /*
   * Un grappolo non e' un buco sulla mappa: e' un chip come quelli del
   * pannello, che dice quanti luoghi ci sono e di che colore. I pallini stanno
   * impilati come le facce di una squadra, dal piu' numeroso in giu', e oltre
   * tre si smette di contarli: quello che serve e' il colpo d'occhio.
   */
  const colours = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const dots = colours.map(([colour]) => `<i style="--c:${colour}"></i>`).join('');

  return L.divIcon({
    className: '',
    html: `<div class="cluster"><span class="cluster-dots">${dots}</span>${children.length}</div>`,
    // niente misura: la pastiglia e' larga quanto il suo contenuto, e si
    // centra da sola sul punto (vedi .cluster in styles/map.css)
    iconSize: undefined,
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
