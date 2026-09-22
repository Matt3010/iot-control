import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AgentMessage } from '../../../shared/protocol.js';
import { agentManager } from '../managers/AgentManager.js';
import { deviceManager } from '../managers/DeviceManager.js';
import type { Agent } from '../types.js';
import { hub } from './hub.js';

/**
 * La versione del contratto, scritta anche nel connettore. Se non combaciano
 * la connessione si chiude subito dicendo perché: un fraintendimento
 * silenzioso sarebbe peggio di un rifiuto.
 */
export const PROTOCOL = 1;

const PATH = '/api/agent/link';
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
        hub.settle(message.reqId, message.ok, message.error);
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
    console.log(`agente scollegato: ${agent.name}`);
  });

  socket.on('error', (error) => console.warn(`${agent.name}: ${error.message}`));
}

/**
 * È l'agent che chiama noi, sempre. Qui si apre solo la porta e si controlla
 * chi bussa — il token porta con sé l'id dell'agente, quindi la derivata da
 * confrontare è una sola.
 */
export function attachAgentLink(server: Server): void {
  const agents = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname !== PATH) return refuse(socket, 404, 'Not Found');

    agentManager
      .authenticate(bearer(request.headers.authorization))
      .then((agent) => {
        if (!agent) return refuse(socket, 401, 'Unauthorized');
        agents.handleUpgrade(request, socket, head, (ws) => serve(ws, agent));
      })
      .catch(() => refuse(socket, 500, 'Internal Server Error'));
  });
}
