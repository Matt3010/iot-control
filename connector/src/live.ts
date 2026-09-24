import { WebSocket } from 'ws';
import type { ConnectorConfig } from './config.js';
import { flowing, forget, remember, sourceOf } from './go2rtc.js';

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

/** Da dove si legge la diretta: il nostro flusso, o quello della centrale. */
interface Sorgente {
  url: string;
  headers?: Record<string, string>;
  /** Se l'abbiamo aperto noi, e quindi va chiuso quando si smette di guardare. */
  nostra: boolean;
}

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

  /*
   * Due strade. Con un indirizzo RTSP — le telecamere di rete di casa — si
   * apre il flusso da noi, transcodificato: la telecamera parla una lingua
   * che serve a registrare, e a noi ne serve una che un browser capisca
   * senza attrezzi, ed è la strada più fluida. Senza — Ring, Nest, Blink e
   * le altre che stanno solo nel cloud — il flusso lo dà la centrale, che
   * ne sa fare uno per ogni telecamera di qualunque marca, anche solo
   * mettendo in fila i fotogrammi. Così la diretta non dipende dalla marca.
   */
  const raw = await sourceOf(entityId);
  const name = `vivo-${entityId}`;
  const sorgente: Sorgente = raw
    ? { url: flowing(name), nostra: true }
    : {
        url: `${config.haUrl}/api/camera_proxy_stream/${encodeURIComponent(entityId)}`,
        headers: { authorization: `Bearer ${config.haToken}` },
        nostra: false,
      };
  if (raw && !(await remember(name, `ffmpeg:${raw}#video=mjpeg`))) {
    throw new Error('non si riesce ad aprire il flusso della telecamera');
  }

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
    if (sorgente.nostra) void forget(name);
  };

  eyes.set(session, { stop });
  socket.on('close', stop);
  socket.on('error', stop);

  socket.on('open', () => {
    void pump(name, sorgente, socket, fps, halt, stop);
  });
}

/** Smetti di guardare. */
export function blind(session: string): void {
  eyes.get(session)?.stop();
}

/** Il travaso vero: legge di qua, butta quello che è di troppo, manda di là. */
async function pump(
  name: string,
  sorgente: Sorgente,
  socket: WebSocket,
  fps: number,
  halt: AbortController,
  stop: () => void,
): Promise<void> {
  const every = Math.max(1000 / Math.max(fps, 1), 0);
  let last = 0;

  try {
    const flow = await fetch(sorgente.url, { signal: halt.signal, headers: sorgente.headers ?? {} });
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
