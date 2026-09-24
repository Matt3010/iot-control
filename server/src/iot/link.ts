import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AgentMessage } from '../../../shared/protocol.js';
import { agentManager } from '../managers/AgentManager.js';
import { logManager } from '../managers/LogManager.js';
import { deviceManager } from '../managers/DeviceManager.js';
import type { Agent } from '../types.js';
import { hub } from './hub.js';
import { liveHub } from './live.js';

/**
 * La versione del contratto, scritta anche nel connettore. Se non combaciano
 * la connessione si chiude subito dicendo perché: un fraintendimento
 * silenzioso sarebbe peggio di un rifiuto.
 */
export const PROTOCOL = 1;

const PATH = '/api/agent/link';
/**
 * La porta accanto: da qui passano solo fotogrammi, e solo per una guardata.
 *
 * Separata apposta. Sul filo dei comandi un video farebbe la coda davanti
 * all'accensione di una luce, e quella e' la cosa che non deve mai aspettare.
 */
const VIDEO = '/api/agent/live';
const HEARTBEAT_MS = 30_000;

/**
 * Un rifiuto prima della stretta di mano è HTTP normale: la WebSocket non è
 * ancora nata.
 *
 * `Content-Length: 0` non è pignoleria: senza, la risposta non dice dove
 * finisce, e un proxy in mezzo — un tunnel Cloudflare, per dire — non riesce a
 * incorniciarla e la trasforma in un 502. Chi si collega col token sbagliato
 * leggerebbe «il backend rifiuta: 502» e andrebbe a cercare il guasto dalla
 * parte sbagliata.
 */
function refuse(socket: Duplex, status: number, reason: string): void {
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\n` + 'Connection: close\r\n' + 'Content-Length: 0\r\n' + '\r\n',
  );
  socket.destroy();
}

const bearer = (header: string | undefined): string | undefined =>
  header?.startsWith('Bearer ') ? header.slice(7) : undefined;

function serve(socket: WebSocket, agent: Agent): void {
  const connection = {
    ownerId: agent.ownerId,
    send: (message: unknown): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: (): void => socket.close(),
  };

  hub.attach(agent.id, connection);
  void agentManager.touch(agent.id);
  logManager.note({ ownerId: agent.ownerId, agentId: agent.id, kind: 'up' });
  console.log(`agente collegato: ${agent.name}`);

  // Una connessione può restare aperta e morta: il ping è l'unico modo per
  // accorgersene, e senza, un agente caduto resterebbe "collegato" per sempre.
  let alive = true;
  socket.on('pong', () => (alive = true));
  const beat = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, HEARTBEAT_MS);
  beat.unref?.();

  const handle = async (raw: string): Promise<void> => {
    let message: AgentMessage;
    try {
      message = JSON.parse(raw) as AgentMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'hello':
        if (message.protocol !== PROTOCOL) {
          console.warn(`${agent.name}: protocollo ${message.protocol}, qui si parla il ${PROTOCOL}`);
          socket.close(4400, `serve il protocollo ${PROTOCOL}`);
          return;
        }
        await deviceManager.sync(agent.ownerId, agent.id, message.devices);
        return;

      case 'devices':
        await deviceManager.sync(agent.ownerId, agent.id, message.devices);
        return;

      case 'state':
        hub.publish(agent.ownerId, agent.id, message.externalId, { online: message.online, state: message.state });
        return;

      case 'ack':
        hub.settle(message.reqId, message.ok, message.error, message.data);
        return;

      default:
        return;
    }
  };

  socket.on('message', (raw) => {
    // Un messaggio storto non deve buttare giù il processo: l'agente è là fuori.
    handle(raw.toString()).catch((error: unknown) => console.warn(`${agent.name}: ${(error as Error).message}`));
  });

  socket.on('close', () => {
    clearInterval(beat);
    hub.detach(agent.id, connection);
    /*
     * Anche andandosene l'agente si è fatto sentire, e il silenzio comincia
     * adesso, non da quando si era collegato.
     *
     * «Visto l'ultima volta» si scriveva solo all'arrivo. Un agente rimasto
     * collegato due ore e caduto per un secondo risultava muto da due ore:
     * se il giro del minuto capitava proprio in quel secondo partivano due
     * avvisi, «ha smesso di rispondere da 2 ore» e subito dopo «ha ripreso
     * dopo 2 ore», tutti e due falsi.
     */
    void agentManager.touch(agent.id);
    logManager.note({ ownerId: agent.ownerId, agentId: agent.id, kind: 'down' });
    console.log(`agente scollegato: ${agent.name}`);
  });

  socket.on('error', (error) => console.warn(`${agent.name}: ${error.message}`));
}

/**
 * Il collegamento che porta il video di una sola telecamera, per il tempo in
 * cui qualcuno la guarda. Il numero di sessione e' nato qui un attimo fa: non
 * si indovina, e non vale per un'altra.
 */
function carry(socket: WebSocket, agent: Agent, session: string): void {
  if (!liveHub.attach(session, agent.id, socket)) {
    socket.close(4004, 'sessione sconosciuta');
    return;
  }

  socket.on('message', (data, isBinary) => {
    if (isBinary) liveHub.feed(session, data as Buffer);
  });
  socket.on('close', () => liveHub.dropped(session));
  socket.on('error', () => liveHub.dropped(session));
}

/**
 * È l'agent che chiama noi, sempre. Qui si apre solo la porta e si controlla
 * chi bussa — il token porta con sé l'id dell'agente, quindi la derivata da
 * confrontare è una sola.
 */
export function attachAgentLink(server: Server): void {
  const agents = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname, searchParams } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname !== PATH && pathname !== VIDEO) return refuse(socket, 404, 'Not Found');

    agentManager
      .authenticate(bearer(request.headers.authorization))
      .then((agent) => {
        if (!agent) return refuse(socket, 401, 'Unauthorized');

        if (pathname === VIDEO) {
          const session = searchParams.get('session') ?? '';
          agents.handleUpgrade(request, socket, head, (ws) => carry(ws, agent, session));
          return;
        }

        agents.handleUpgrade(request, socket, head, (ws) => serve(ws, agent));
      })
      .catch(() => refuse(socket, 500, 'Internal Server Error'));
  });
}
