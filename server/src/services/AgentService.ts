import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { AgentView } from '../dto/views.js';
import { toAgentView } from '../dto/views.js';
import { badGateway, notFound } from '../errors/HttpError.js';
import type { CatalogEntry, LinkedAccount, PairMessage, PairingStep } from '../../../shared/protocol.js';
import { hub } from '../iot/hub.js';
import { toPlaceView } from '../dto/views.js';
import { agentManager } from '../managers/AgentManager.js';
import { logManager } from '../managers/LogManager.js';
import { deviceManager } from '../managers/DeviceManager.js';
import { dimentica } from './AccountWatch.js';
import type { Scope } from '../types.js';

export interface NewAgentView {
  agent: AgentView;
  /** In chiaro una volta sola: dopo resta solo la derivata. */
  token: string;
  /** La riga da incollare su quella macchina. */
  install: string;
}

/** Da https://… a wss://…: è lo stesso posto, con un'altra porta d'ingresso. */
const linkUrl = (origin: string): string => `${origin.replace(/^http/, 'ws')}/api/agent/link`;

/**
 * Due sistemi, due conchiglie. Su Linux si scarica e si esegue con sh; su
 * Windows la stessa cosa si dice con PowerShell, e lo script che arriva è un
 * altro perché lì Docker non mette un container sulla rete di casa.
 */
/**
 * Una riga sola, e vuole Linux. Non per pigrizia: fuori di lì Docker gira
 * dentro una VM che non sta sulla rete di casa, e un agente che non vede i
 * dispositivi è un agente a metà. Su Windows si incolla dentro WSL, su Mac
 * dentro una VM: in tutti e due i casi lo script si ritrova su Linux, che è
 * quello che gli serve.
 */
const installCommand = (origin: string, id: string, token: string): string =>
  `curl -fsSL "${origin}/api/agents/${id}/install?t=${token}" | sudo sh`;

async function render(file: string, values: Record<string, string>): Promise<string> {
  const template = await fs.readFile(path.join(config.deployDir, file), 'utf8');
  return template.replace(/@@([A-Z_]+)@@/g, (_whole, key: string) => values[key] ?? '');
}

export class AgentService {
  async list(scope: Scope): Promise<AgentView[]> {
    const [agents, devices] = await Promise.all([agentManager.list(scope), deviceManager.list(scope)]);
    return agents.map((agent) =>
      toAgentView(agent, hub.isOnline(agent.id), devices.filter((device) => device.agentId === agent.id).length),
    );
  }

  async create(scope: Scope, name: string, origin: string): Promise<NewAgentView> {
    const { agent, token } = await agentManager.create(scope, name);
    hub.changed(scope.ownerId, { kind: 'agents' });
    return {
      agent: toAgentView(agent, false, 0),
      token,
      install: installCommand(origin, agent.id, token),
    };
  }

  async rename(scope: Scope, id: string, name: string): Promise<AgentView> {
    const agent = await agentManager.rename(scope, id, name);
    const devices = await deviceManager.list(scope);
    hub.changed(scope.ownerId, { kind: 'agents' });
    return toAgentView(agent, hub.isOnline(agent.id), devices.filter((device) => device.agentId === agent.id).length);
  }

  async rotate(scope: Scope, id: string, origin: string): Promise<NewAgentView> {
    const { agent, token } = await agentManager.rotate(scope, id);
    hub.changed(scope.ownerId, { kind: 'agents' });
    return {
      agent: toAgentView(agent, hub.isOnline(agent.id), 0),
      token,
      install: installCommand(origin, agent.id, token),
    };
  }

  /**
   * Un agente che se ne va porta via i suoi dispositivi e si stacca dai luoghi
   * che lo tenevano. Sono tre cose diverse da raccontare, e chi guarda da
   * un'altra scheda deve vederle tutte e tre — se no gli resta sulla mappa un
   * pin con un pallino che non risponderà mai più.
   */
  async remove(scope: Scope, id: string): Promise<void> {
    const ownerId = scope.ownerId;
    const { places, regole } = await agentManager.remove(scope, id);
    dimentica(id);
    /*
     * Un evento solo per agenti, dispositivi e scene: il sito li rilegge
     * sempre tutti e tre insieme, e due eventi volevano dire due volte la
     * stessa lettura. Le regole degli avvisi cadute con i dispositivi hanno
     * il loro, e ogni luogo che lo teneva il suo.
     */
    hub.changed(ownerId, { kind: 'devices' });
    if (regole) hub.changed(ownerId, { kind: 'rules' });
    for (const place of places) {
      const view = toPlaceView(place);
      hub.changed(ownerId, { kind: 'place', id: view.id, value: view });
    }
  }

  /**
   * Collegare un account a quell'agente, una battuta per volta. Noi non
   * sappiamo cosa sia Tuya: passiamo la domanda e riportiamo indietro il
   * passo successivo, QR compreso.
   */
  async pair(
    scope: Scope,
    id: string,
    action: PairMessage['action'],
    options: { handler?: string; flowId?: string; input?: Record<string, string | boolean>; entryId?: string },
    who?: string,
  ): Promise<PairingStep | LinkedAccount[] | CatalogEntry[] | null> {
    /*
     * Che sia tuo lo si controlla prima di bussare a casa sua. Anche solo
     * guardare gli account collegati: sono di chi possiede l'indice, con i
     * loro nomi e le loro email, e un ospite non ne ha bisogno per accendere
     * una luce.
     */
    await agentManager.guard(scope, id);
    const ownerId = scope.ownerId;

    try {
      const step = (await hub.pair(id, action, options)) as PairingStep | LinkedAccount[] | CatalogEntry[] | undefined;

      /*
       * Un account collegato o staccato è una di quelle cose che succedono
       * una volta e che poi ti chiedi quando: «da quando non vede più le
       * prese?» ha una risposta solo se quel giorno qualcuno l'ha scritta.
       * L'elenco no: guardare non è successo niente.
       */
      if (action === 'unlink') {
        logManager.note({ ownerId, agentId: id, kind: 'account', detail: 'scollegato', who });
      } else if (step && !Array.isArray(step) && step.kind === 'done') {
        logManager.note({
          ownerId,
          agentId: id,
          kind: 'account',
          subject: options.handler,
          detail: 'collegato',
          who,
        });
      }

      return step ?? null;
    } catch (error) {
      throw badGateway((error as Error).message);
    }
  }

  /**
   * Questi due li scarica quella macchina, senza essere entrata da nessuna
   * parte: l'unica prova che porta è il token, che è anche quello con cui poi
   * si collegherà. Un indirizzo solo, un segreto solo.
   */
  async #agentOf(id: string, token: string | undefined) {
    const agent = await agentManager.authenticate(token);
    if (!agent || agent.id !== id) throw notFound('agente inesistente');
    return agent;
  }

  async install(id: string, token: string | undefined, origin: string): Promise<string> {
    const agent = await this.#agentOf(id, token);
    return render('install.sh', {
      BASE: origin,
      AGENT_ID: agent.id,
      TOKEN: token ?? '',
      NAME: agent.name,
      BACKEND_URL: linkUrl(origin),
    });
  }

  async compose(id: string, token: string | undefined): Promise<string> {
    await this.#agentOf(id, token);
    return render('docker-compose.yml', {
      OWNER: config.house.owner,
      MAJOR: config.house.connectorMajor,
      HA_VERSION: config.house.haVersion,
      TZ: config.house.timezone,
    });
  }
}

export const agentService = new AgentService();
