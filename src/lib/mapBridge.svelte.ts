import type { Map as LeafletMap, Marker } from 'leaflet';
import { here } from './here.svelte';
import { CLUSTER_OFF_AT, metersBetween } from './mapkit';
import type { LocalPlace } from './types';

/**
 * The map is imperative by nature. This is the seam: the map component fills
 * it in, the panels call it, and the view it publishes is reactive so the
 * index can say what is on screen.
 */
class MapBridge {
  /** Bumped by the map on every moveend: whoever reads it re-runs. */
  view = $state({ lat: 41.9, lng: 12.5, zoom: 6, moves: 0 });
  /** The place whose popup is open, so the index can point at the same row. */
  activeKey = $state<string | null>(null);

  #map: LeafletMap | null = null;
  #markers = new Map<string, Marker>();

  attach(map: LeafletMap, markers: Map<string, Marker>): void {
    this.#map = map;
    this.#markers = markers;
  }

  /** La mappa se ne va (uscita, ricarica a caldo): il ponte non la trattiene. */
  detach(map: LeafletMap): void {
    if (this.#map !== map) return; // ne è già arrivata un'altra: non è roba sua
    this.#map = null;
    this.#markers = new Map();
  }

  /**
   * Una mappa rimossa lascia in giro l'oggetto ma non i suoi pannelli: chiederle
   * i confini la farebbe scoppiare. Qui passa solo se è ancora viva.
   */
  get #live(): LeafletMap | null {
    const map = this.#map;
    return map && (map as unknown as { _mapPane?: HTMLElement })._mapPane ? map : null;
  }

  get map(): LeafletMap | null {
    return this.#live;
  }

  markerFor(place: LocalPlace): Marker | undefined {
    return this.#markers.get(place.key);
  }

  /** Lift the pin that belongs to a row being pointed at. */
  highlight(place: LocalPlace, on: boolean): void {
    const marker = this.markerFor(place);
    const pin = (marker as unknown as { _icon?: HTMLElement })?._icon?.firstElementChild;
    if (!marker || !pin) return;
    pin.classList.toggle('is-hover', on);
    marker.setZIndexOffset(on ? 900 : 0);
  }

  focus(place: LocalPlace): void {
    const map = this.#live;
    const marker = this.markerFor(place);
    if (!map || !marker) return;
    map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), CLUSTER_OFF_AT), { duration: 0.7 });
    map.once('moveend', () => marker.openPopup());
  }

  /** Picking "Padova" should take you to Padova, not leave you where you were. */
  flyToPoints(points: [number, number][]): void {
    const map = this.#live;
    if (!map || !points.length) return;
    map.flyToBounds(points, { padding: [70, 70], maxZoom: 15, duration: 0.8 });
  }

  goTo(lat: number, lng: number, minZoom: number): void {
    const map = this.#live;
    if (!map) return;
    map.setView([lat, lng], Math.max(map.getZoom(), minZoom));
  }

  contains(lat: number, lng: number): boolean {
    return this.#live?.getBounds().contains([lat, lng]) ?? false;
  }

  /**
   * Da dove si misura: da te, se ci hai fatto sapere dove sei; se no dal
   * centro di quello che stai guardando.
   */
  distanceFrom(lat: number, lng: number): number {
    const me = here.spot;
    if (me) return metersBetween([me.lat, me.lng], [lat, lng]);
    return this.#live?.getCenter().distanceTo([lat, lng]) ?? 0;
  }
}

export const mapBridge = new MapBridge();
