/*
 * Quanto sono lontani due punti, senza Leaflet.
 *
 * L'elenco dei luoghi misura le distanze anche su un telefono, dove la mappa
 * non c'è: chiederlo a Leaflet voleva dire scaricarlo tutto per una formula
 * di quattro righe. È la stessa che usa lui (la terra come una sfera di
 * 6371 km), così i numeri non cambiano.
 */
const RAGGIO = 6_371_000;

/** Quanti metri ci sono fra due punti. */
export function metersBetween(from: [number, number], to: [number, number]): number {
  const rad = Math.PI / 180;
  const lat1 = from[0] * rad;
  const lat2 = to[0] * rad;
  const dLat = lat2 - lat1;
  const dLng = (to[1] - from[1]) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * RAGGIO * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Oltre questo zoom ogni marker sta per sé, quindi un popup può aprirsi. */
export const CLUSTER_OFF_AT = 17;
