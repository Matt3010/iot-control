import net from 'node:net';
import { sourceOf } from './go2rtc.js';

/**
 * Se una telecamera c'è davvero.
 *
 * Per tutto il resto della casa «raggiungibile» è quello che dice Home
 * Assistant, e va bene: una presa che non risponde lui la chiama
 * `unavailable` e noi lo ripetiamo. Per una telecamera generica no. Lui non
 * va a bussare — tiene l'entità ferma su `idle` e scopre che il video non
 * c'è solo quando qualcuno chiede un'immagine — quindi un registratore
 * staccato dalla rete restava verde per giorni, e l'avviso «dimmi se smette
 * di rispondere» non sarebbe scattato mai: da qui non aveva mai smesso.
 *
 * Qui si bussa. Non si chiede un fotogramma, che vuol dire accendere un
 * ffmpeg per ognuna e aspettare un fotogramma chiave: si apre un
 * collegamento alla porta da cui esce il video e si guarda se qualcuno
 * risponde. È la stessa domanda che si fa a mano con un telnet, costa un
 * pacchetto, e distingue le due cose che contano — il registratore c'è, il
 * registratore non c'è.
 */

/** Quanto si aspetta una risposta. È in casa: o risponde subito o non c'è. */
const KNOCK_MS = 3_000;

/** Ogni quanto si ribussa. Un minuto: l'avviso può tardare un minuto. */
const EVERY_MS = 60_000;

/** Da dove esce il video di ognuna, per non richiederlo a ogni giro. */
const doors = new Map<string, { host: string; port: number } | null>();

/** Com'è andata l'ultima volta. */
const seen = new Map<string, boolean>();

function doorOf(raw: string): { host: string; port: number } | null {
  try {
    const where = new URL(raw);
    return { host: where.hostname, port: Number(where.port) || 554 };
  } catch {
    return null;
  }
}

/** Bussa, e dice se ha risposto qualcuno. */
function knock(host: string, port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = new net.Socket();
    const chiudi = (esito: boolean): void => {
      socket.destroy();
      done(esito);
    };
    socket.setTimeout(KNOCK_MS);
    socket.once('connect', () => chiudi(true));
    socket.once('timeout', () => chiudi(false));
    socket.once('error', () => chiudi(false));
    socket.connect(port, host);
  });
}

/**
 * Se questa telecamera risponde adesso.
 *
 * Senza il suo indirizzo non si sa, e non sapere non è la stessa cosa che
 * sapere di no: in quel caso si lascia dire ad Home Assistant quello che
 * pensa lui, invece di spegnere una cosa che magari sta benissimo.
 */
export async function reachable(entityId: string): Promise<boolean | undefined> {
  if (!doors.has(entityId)) {
    const raw = await sourceOf(entityId);
    doors.set(entityId, raw ? doorOf(raw) : null);
  }

  const door = doors.get(entityId);
  if (!door) return undefined;

  const risponde = await knock(door.host, door.port);
  seen.set(entityId, risponde);
  return risponde;
}

/** Quello che si sa adesso, senza bussare di nuovo. */
export const lastSeen = (entityId: string): boolean | undefined => seen.get(entityId);

/**
 * Quando una richiesta di immagine fallisce lo sappiamo senza bussare: è la
 * prova più forte che ci sia, e arriva gratis. Al contrario, un fotogramma
 * arrivato dice che c'è.
 */
export function noticed(entityId: string, ok: boolean): boolean {
  const prima = seen.get(entityId);
  seen.set(entityId, ok);
  return prima !== ok;
}

/** L'indirizzo può cambiare: quando l'inventario si rifà, si riparte da capo. */
export function forgetDoors(): void {
  doors.clear();
}

/**
 * Il giro: bussa a tutte e dice a chi di dovere quali hanno cambiato idea.
 * Parte dopo il primo minuto e non subito — appena acceso si sta ancora
 * collegando tutto, e dire «non risponde» di qualcosa che sta rispondendo
 * adesso sarebbe la bugia peggiore.
 */
export function watchEyes(which: () => string[], changed: (entityId: string, up: boolean) => void): void {
  setInterval(() => {
    void (async () => {
      for (const entityId of which()) {
        const prima = seen.get(entityId);
        const adesso = await reachable(entityId);
        if (adesso !== undefined && adesso !== prima) changed(entityId, adesso);
      }
    })().catch((error: Error) => console.warn(`giro delle telecamere: ${error.message}`));
  }, EVERY_MS).unref();
}
