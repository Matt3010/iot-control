import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { WebSocket } from 'ws';
import { hub } from './hub.js';

/**
 * Guardare una telecamera in diretta.
 *
 * Una fotografia ogni cinque secondi era il massimo dell'altra strada: ogni
 * fotogramma apriva il flusso, aspettava un fotogramma chiave e lo richiudeva
 * — quattro secondi buoni, sempre. Qui il flusso resta aperto finché qualcuno
 * guarda, e i fotogrammi arrivano da soli.
 *
 * Non arrivano dal filo dei comandi. Quel filo porta anche l'accensione di una
 * luce, e un comando in coda dietro a mezz'ora di video sarebbe una tenda che
 * non si apre quando la premi: l'agente apre un collegamento a parte, per
 * questa guardata e basta, e lo chiude alla fine.
 *
 * Di là il video esce come lo mangia un browser senza aiuto: fotogrammi uno
 * dietro l'altro dentro una risposta sola, quella che un `<img>` sa già
 * disegnare. Niente lettori, niente codec, niente da installare.
 */

/** Il tetto: più di così non se ne chiedono, anche se la telecamera ne dà di più. */
const FPS = 10;

/**
 * Quanto si aspetta che l'agente si faccia vivo col video. Se non arriva
 * niente, la risposta si chiude e chi guarda torna alle fotografie: meglio un
 * riquadro che si aggiorna piano di uno che resta vuoto per sempre.
 */
const HELLO_MS = 25_000;

/** Il segno che separa un fotogramma dall'altro. Lo sceglie chi manda. */
const SEP = 'fotogramma';

interface Viewer {
  res: Response;
  /**
   * Vero quando la sua connessione è piena e non accetta altro. Finché lo è,
   * i fotogrammi si buttano invece di accodarsi: un telefono lento deve
   * vedere a scatti, non far arretrare tutti gli altri.
   */
  slow: boolean;
}

interface Session {
  id: string;
  ownerId: string;
  agentId: string;
  externalId: string;
  viewers: Set<Viewer>;
  socket?: WebSocket;
  /** Quanti ne sono passati: serve a sapere se l'agente si è mai fatto vivo. */
  frames: number;
  hello?: NodeJS.Timeout;
}

class LiveHub {
  #sessions = new Map<string, Session>();
  /** Una telecamera, una sessione: se in tre la guardano, il flusso resta uno. */
  #open = new Map<string, string>();

  #key = (agentId: string, externalId: string): string => `${agentId}\u0000${externalId}`;

  /**
   * Uno in più che guarda. Se è il primo, si chiede all'agente di aprire; se
   * non lo è, si attacca a quello che già scorre — e il primo fotogramma lo
   * vede al giro dopo, che è meno di un decimo di secondo.
   */
  join(ownerId: string, agentId: string, externalId: string, res: Response): void {
    const already = this.#open.get(this.#key(agentId, externalId));
    const session = (already && this.#sessions.get(already)) || this.#begin(ownerId, agentId, externalId);

    const viewer: Viewer = { res, slow: false };
    res.writeHead(200, {
      'content-type': `multipart/x-mixed-replace; boundary=${SEP}`,
      'cache-control': 'no-store, max-age=0',
      // per chi sta in mezzo: questa risposta non si mette da parte, si passa
      'x-accel-buffering': 'no',
    });
    res.flushHeaders?.();

    res.on('drain', () => (viewer.slow = false));
    res.on('close', () => this.#leave(session, viewer));
    session.viewers.add(viewer);
  }

  /** Un fotogramma appena arrivato, da dare a chi sta guardando. */
  feed(sessionId: string, frame: Buffer): void {
    const session = this.#sessions.get(sessionId);
    if (!session || !frame.length) return;

    session.frames += 1;
    const head = `--${SEP}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;

    for (const viewer of session.viewers) {
      if (viewer.slow) continue;
      viewer.res.write(head);
      const room = viewer.res.write(frame);
      viewer.res.write('\r\n');
      if (!room) viewer.slow = true;
    }
  }

  /**
   * L'agente si presenta col video. Il numero di sessione è l'unica cosa che
   * lo autorizza a scaricare fotogrammi qui dentro, ed è nato un attimo fa
   * dalla nostra parte: non si può indovinare, e non vale per un altro.
   */
  attach(sessionId: string, agentId: string, socket: WebSocket): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session || session.agentId !== agentId || session.socket) return false;

    session.socket = socket;
    if (session.hello) clearTimeout(session.hello);
    return true;
  }

  /** Il video è caduto: chi guardava torna alle fotografie. */
  dropped(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (session) this.#end(session);
  }

  #begin(ownerId: string, agentId: string, externalId: string): Session {
    const session: Session = {
      id: randomUUID(),
      ownerId,
      agentId,
      externalId,
      viewers: new Set(),
      frames: 0,
    };

    this.#sessions.set(session.id, session);
    this.#open.set(this.#key(agentId, externalId), session.id);

    session.hello = setTimeout(() => {
      if (!session.frames) this.#end(session);
    }, HELLO_MS);
    session.hello.unref?.();

    void hub.watchCamera(agentId, externalId, session.id, FPS).catch(() => this.#end(session));
    return session;
  }

  #leave(session: Session, viewer: Viewer): void {
    session.viewers.delete(viewer);
    // L'ultimo che esce spegne la luce: un flusso aperto per nessuno costa
    // banda a casa di qualcuno e un cuore di macchina, tutta la notte.
    if (!session.viewers.size) this.#end(session);
  }

  #end(session: Session): void {
    if (!this.#sessions.delete(session.id)) return;
    this.#open.delete(this.#key(session.agentId, session.externalId));
    if (session.hello) clearTimeout(session.hello);

    for (const viewer of session.viewers) {
      /*
       * Se non e' mai arrivato niente, chiudere con garbo vorrebbe dire una
       * risposta vuota e riuscita: di la' un'immagine che non compare e non
       * si lamenta, e chi guarda resta davanti a un riquadro scuro per
       * sempre. Si stacca il filo, cosi' il browser lo sa e si puo' ripiegare
       * sulle fotografie.
       */
      if (session.frames) viewer.res.end();
      else viewer.res.destroy();
    }
    session.viewers.clear();

    session.socket?.close();
    void hub.unwatchCamera(session.agentId, session.id).catch(() => undefined);
  }
}

export const liveHub = new LiveHub();
