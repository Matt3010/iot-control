import { mapForGuest } from '../dto/views.js';
import { hub, type LiveEvent } from '../iot/hub.js';
import type { Raggio } from '../managers/raggio.js';

/**
 * Quello che del filo aperto arriva a un ospite.
 *
 * Esiste perché il filo è per indice: tutto quello che succede in casa del
 * padrone scende a chiunque ci stia lavorando, e un ospite a cui è aperto un
 * luogo solo riceveva le note dei luoghi che non vede, le email di chi lavora
 * sulle altre mappe, gli stati di dispositivi di cui non deve sapere niente.
 * Qui ogni evento passa per lo stesso raggio che usano gli elenchi
 * (`managers/raggio.ts`): a caldo non arriva mai più di quello che si
 * leggerebbe ricaricando.
 *
 * `prima` è il raggio di prima dell'evento, `dopo` quello di adesso. Servono
 * tutti e due per le cose che escono dal raggio: di una scena che non si
 * vede più si manda che non c'è più, di una che non si è mai vista niente.
 */
export function perOspite(event: LiveEvent, prima: Raggio, dopo: Raggio): LiveEvent | null {
  /** Una cosa che c'era e adesso non si vede più: per chi guarda, non c'è più. */
  const uscita = <E extends { id: string; value: unknown }>(e: E, eraVista: boolean): LiveEvent | null =>
    eraVista ? ({ ...e, value: null } as unknown as LiveEvent) : null;

  switch (event.kind) {
    case 'device':
      return dopo.vedeDispositivo(event.deviceId) && !hub.isCamera(event.deviceId) ? event : null;
    case 'agent':
    case 'log':
      return dopo.vedeAgente(event.agentId) ? event : null;
    // gli account collegati sono del padrone, e un ospite non li vede nemmeno rileggendo
    case 'accounts':
      return null;
    case 'running':
      return dopo.vedeScena(event.sceneId) ? event : null;
    case 'scene':
      if (event.value && dopo.vedeScena(event.id)) return event;
      return event.value ? uscita(event, prima.vedeScena(event.id)) : prima.vedeScena(event.id) ? event : null;
    case 'place':
      if (event.value && dopo.vedeMappa(event.value.mapId)) return event;
      return event.value ? uscita(event, prima.vedeLuogo(event.id)) : prima.vedeLuogo(event.id) ? event : null;
    case 'map':
      if (event.value && dopo.vedeMappa(event.id)) return { ...event, value: mapForGuest(event.value) };
      return event.value ? uscita(event, prima.vedeMappa(event.id)) : prima.vedeMappa(event.id) ? event : null;
    /*
     * Il resto è un segnale di rileggere senza niente dentro — gli elenchi,
     * le regole, gli avvisi — o una cosa che un ospite vede intera, come le
     * categorie e i gruppi: rileggendo avrà la sua parte e basta.
     */
    default:
      return event;
  }
}

/** Gli eventi dopo i quali il raggio può essere cambiato, e va riletto prima di filtrare. */
export const cambiaIlRaggio = (event: LiveEvent): boolean =>
  event.kind === 'devices' ||
  event.kind === 'agents' ||
  event.kind === 'place' ||
  event.kind === 'map' ||
  event.kind === 'scene';
