import net from 'node:net';
import { askSource, sourceOf } from './go2rtc.js';
import { frameFrom } from './homeassistant.js';

/**
 * Se una telecamera c'è davvero.
 *
 * Per tutto il resto della casa «raggiungibile» è quello che dice Home
 * Assistant, e va bene: una presa che non risponde lui la chiama
 * `unavailable` e noi lo ripetiamo. Per una telecamera generica no. Lui non
 * va a bussare — tiene l'entità ferma su `idle` e scopre che il video non
 * c'è solo quando qualcuno chiede un'immagine — quindi un registratore
 * staccato restava verde per giorni, e l'avviso «dimmi se smette di
 * rispondere» non sarebbe scattato mai: da qui non aveva mai smesso.
 *
 * Qui si guarda davvero, in due modi che costano due prezzi diversi:
 *
 * - **si bussa** alla porta da cui esce il video, che costa un pacchetto. Se
 *   non risponde nessuno la telecamera non c'è, e non serve altro.
 * - **si chiede un fotogramma**, che costa un ffmpeg e l'attesa di un
 *   fotogramma chiave. Serve perché bussare non basta: un registratore può
 *   tenere la porta aperta e non mandare niente, e quello è il caso in cui
 *   sullo schermo compare il nero. Si chiede solo a quelle che risultano
 *   rotte, cioè quasi mai.
 */

/** Quanto si aspetta una risposta alla porta. È in casa: o risponde subito o non c'è. */
const KNOCK_MS = 3_000;

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
 * L'indirizzo da cui esce il video, chiesto una volta e tenuto da parte.
 * Si tiene da parte anche «non ce l'ha», ma non «non ho potuto chiederlo»:
 * quello si richiede al giro dopo.
 */
async function doorFor(entityId: string): Promise<{ host: string; port: number } | null> {
  if (!doors.has(entityId)) {
    let raw: string | undefined;
    try {
      raw = await askSource(entityId);
    } catch {
      return null;
    }
    doors.set(entityId, raw ? doorOf(raw) : null);
  }
  return doors.get(entityId) ?? null;
}

/**
 * Cosa ne sappiamo adesso.
 *
 * `undefined` vuol dire che non si sa — una telecamera di cui non si conosce
 * l'indirizzo, o a cui non si è ancora bussato. Non sapere non è sapere di
 * no: in quel caso si lascia dire a Home Assistant quello che pensa lui,
 * invece di spegnere una cosa che magari sta benissimo.
 */
export const lastSeen = (entityId: string): boolean | undefined => seen.get(entityId);

/**
 * Un fotogramma appena chiesto da una persona: è la prova più forte che ci
 * sia e arriva gratis. Torna vero se cambia quello che sapevamo.
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
 * Il controllo di una telecamera, e la regola fra i due modi di guardare.
 *
 * Si bussa sempre, perché costa niente. Se non risponde nessuno è rossa, e
 * finisce lì. Se invece risponde ma l'ultima immagine non era arrivata, si
 * chiede un fotogramma vero: è l'unico modo di sapere se è tornata davvero,
 * e senza di lui una telecamera che tiene la porta aperta e non manda niente
 * resterebbe verde per sempre — o, peggio, una che si è ripresa resterebbe
 * rossa perché nessuno le chiede più niente.
 */
export async function look(entityId: string): Promise<boolean | undefined> {
  const door = await doorFor(entityId);
  if (!door) return undefined;

  const risponde = await knock(door.host, door.port);
  if (!risponde) {
    seen.set(entityId, false);
    return false;
  }

  // la porta è aperta e l'ultima volta l'immagine arrivava: non si disturba
  // il registratore per chiedergli una cosa che sappiamo già
  if (seen.get(entityId) === true) return true;

  const raw = await sourceOf(entityId);
  const jpeg = raw ? await frameFrom(raw, `prova-${entityId}`) : undefined;
  const up = !!jpeg?.length;
  seen.set(entityId, up);
  return up;
}

/** Ogni quanto si guarda. Un minuto: l'avviso può tardare un minuto. */
const EVERY_MS = 60_000;

/**
 * Il giro, e chi ha cambiato idea.
 *
 * Parte dopo il primo minuto e non subito: appena acceso si sta ancora
 * collegando tutto, e dire «non risponde» di qualcosa che sta rispondendo
 * adesso sarebbe la bugia peggiore.
 */
export function watchEyes(which: () => string[], changed: (entityId: string, up: boolean) => void): void {
  // Un giro con una telecamera lenta può durare più di un minuto. Un secondo
  // giro accanto chiederebbe gli stessi fotogrammi due volte e potrebbe dire
  // «cambiata» sulla base di un ricordo che l'altro sta ancora scrivendo: si
  // salta, e si guarda al minuto dopo.
  let inGiro = false;
  setInterval(() => {
    if (inGiro) return;
    inGiro = true;
    void (async () => {
      for (const entityId of which()) {
        const prima = seen.get(entityId);
        const adesso = await look(entityId);
        if (adesso !== undefined && adesso !== prima) changed(entityId, adesso);
      }
    })()
      .catch((error: Error) => console.warn(`giro delle telecamere: ${error.message}`))
      .finally(() => {
        inGiro = false;
      });
  }, EVERY_MS).unref();
}
