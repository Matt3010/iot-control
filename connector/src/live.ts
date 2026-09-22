import { WebSocket } from 'ws';
import type { ConnectorConfig } from './config.js';
import { sourceOf } from './homeassistant.js';

/**
 * Una telecamera guardata in diretta.
 *
 * Il flusso di una telecamera resta aperto finché qualcuno guarda, e i
 * fotogrammi salgono da soli. Non sul filo dei comandi: quello porta anche
 * l'accensione di una luce, e una luce non deve aspettare il suo turno dietro
 * a un video. Per ogni guardata si apre un collegamento a parte, e si chiude
 * quando la guardata finisce.
 *
 * Quello che sale sono JPEG interi, uno per messaggio: di là un browser li
 * disegna da solo, senza lettori e senza codec.
 */

const STREAMS = 'http://127.0.0.1:11984/api/streams';
const MJPEG = 'http://127.0.0.1:11984/api/stream.mjpeg';

/**
 * Quanto si lascia accumulare sul collegamento prima di buttare via un
 * fotogramma.
 *
 * Su un upload stretto — e l'upload di casa è sempre il pezzo stretto — i
 * fotogrammi arrivano più in fretta di quanto partano. Accodarli vorrebbe
 * dire guardare il passato con qualche secondo di ritardo che cresce: meglio
 * saltarne uno e restare adesso.
 */
const TOO_MUCH = 1_000_000;

interface Looking {
  stop: () => void;
}

const eyes = new Map<string, Looking>();

/** Da dove sale il video: la stessa porta di casa, la stanza accanto. */
function videoUrl(config: ConnectorConfig, session: string): string {
  const base = config.backendUrl.replace(/\/link$/, '/live');
  return `${base}?session=${encodeURIComponent(session)}`;
}

/**
 * Lo spezzettatore.
 *
 * Quello che arriva è un flusso senza fine con dentro i fotogrammi uno dietro
 * l'altro, separati da una riga concordata. Si accumula finché non se ne ha
 * uno intero, e lo si passa: a metà non serve a nessuno.
 */
function cutter(boundary: string, onFrame: (jpeg: Buffer) => void): (chunk: Buffer) => void {
  const sep = Buffer.from(`--${boundary}`);
  let held: Buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    held = held.length ? Buffer.concat([held, chunk]) : Buffer.from(chunk);

    for (;;) {
      const start = held.indexOf(sep);
      if (start < 0) return;

      const headEnd = held.indexOf('\r\n\r\n', start);
      if (headEnd < 0) return;

      const head = held.subarray(start, headEnd).toString('latin1');
      const said = /content-length:\s*(\d+)/i.exec(head);
      const body = headEnd + 4;

      if (said) {
        const size = Number(said[1]);
        if (held.length < body + size) return;
        onFrame(held.subarray(body, body + size));
        held = held.subarray(body + size);
        continue;
      }

      // Senza lunghezza dichiarata il fotogramma finisce dove comincia il prossimo.
      const next = held.indexOf(sep, body);
      if (next < 0) return;
      onFrame(held.subarray(body, Math.max(body, next - 2)));
      held = held.subarray(next);
    }
  };
}

/**
 * Comincia a guardare.
 *
 * Il flusso si apre transcodificato: la telecamera parla una lingua che serve
 * a registrare, e a noi serve una che un browser capisca senza attrezzi.
 */
export async function look(
  config: ConnectorConfig,
  session: string,
  entityId: string,
  fps: number,
): Promise<void> {
  if (eyes.has(session)) return;

  const raw = await sourceOf(entityId);
  if (!raw) throw new Error('non si riesce a sapere l’indirizzo di questa telecamera');

  const name = `vivo-${entityId}`;
  const set = await fetch(`${STREAMS}?name=${encodeURIComponent(name)}&src=${encodeURIComponent(`ffmpeg:${raw}#video=mjpeg`)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  if (!set?.ok) throw new Error('non si riesce ad aprire il flusso della telecamera');

  const halt = new AbortController();
  const socket = new WebSocket(videoUrl(config, session), {
    headers: { authorization: `Bearer ${config.token}` },
    handshakeTimeout: 15_000,
  });

  let done = false;
  const stop = (): void => {
    if (done) return;
    done = true;
    eyes.delete(session);
    halt.abort();
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    void fetch(`${STREAMS}?src=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  };

  eyes.set(session, { stop });
  socket.on('close', stop);
  socket.on('error', stop);

  socket.on('open', () => {
    void pump(name, socket, fps, halt, stop);
  });
}

/** Smetti di guardare. */
export function blind(session: string): void {
  eyes.get(session)?.stop();
}

/** Il travaso vero: legge di qua, butta quello che è di troppo, manda di là. */
async function pump(
  name: string,
  socket: WebSocket,
  fps: number,
  halt: AbortController,
  stop: () => void,
): Promise<void> {
  const every = Math.max(1000 / Math.max(fps, 1), 0);
  let last = 0;

  try {
    const flow = await fetch(`${MJPEG}?src=${encodeURIComponent(name)}`, { signal: halt.signal });
    if (!flow.ok || !flow.body) throw new Error(`il flusso dice ${flow.status}`);

    const said = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(flow.headers.get('content-type') ?? '');
    const boundary = (said?.[1] ?? said?.[2] ?? '').trim();
    if (!boundary) throw new Error('il flusso non dice dove finisce un fotogramma');

    const cut = cutter(boundary, (jpeg) => {
      const now = Date.now();
      // Il tetto, e la valvola: più di così non se ne mandano, e se il
      // collegamento è già pieno questo si perde invece di accodarsi.
      if (now - last < every) return;
      if (socket.bufferedAmount > TOO_MUCH) return;
      last = now;
      socket.send(jpeg);
    });

    for await (const chunk of flow.body as unknown as AsyncIterable<Buffer>) cut(Buffer.from(chunk));
  } catch (error) {
    if (!halt.signal.aborted) console.warn(`diretta di ${name}: ${(error as Error).message}`);
  } finally {
    stop();
  }
}
