import fs from 'node:fs';
import { WebSocket } from 'ws';
import type { ConnectorConfig } from './config.js';
import { stateFile } from './config.js';

/**
 * Il primo avvio di Home Assistant, fatto da noi.
 *
 * Appena installato, HA aspetta che qualcuno apra il browser e crei l'utente:
 * finché non c'è quello non esiste nemmeno un token da usare. È il pezzo che
 * costringeva una persona a fare tre minuti di clic prima che questo servizio
 * potesse partire — e quei tre minuti sono API, quindi li facciamo qui.
 *
 * Resta fuori una cosa sola, e per scelta di Tuya: scansionare il QR con
 * l'app Smart Life. Quello vuole un telefono e un essere umano.
 */

/** Il token lungo vive qui, non nel .env: è nato qui e non deve girare. */
const TOKEN_FILE = 'ha-token';

/** HA su un Raspberry ci mette il suo a rispondere la prima volta. */
const READY_TIMEOUT_MS = 300_000;
const POLL_MS = 3_000;

interface Step {
  step: string;
  done: boolean;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
}

/** Si aspetta che apra bottega, e si dice quanto manca invece di stare zitti. */
async function waitForHa(config: ConnectorConfig): Promise<Step[]> {
  const until = Date.now() + READY_TIMEOUT_MS;
  let said = false;

  for (;;) {
    try {
      const response = await ask(`${config.haUrl}/api/onboarding`);
      if (response.ok) return (await response.json()) as Step[];
    } catch {
      /* non è ancora in piedi */
    }

    if (Date.now() > until) throw new Error('home assistant non è partito entro cinque minuti');
    if (!said) {
      console.log('aspetto che home assistant finisca di partire…');
      said = true;
    }
    await wait(POLL_MS);
  }
}

/**
 * Crea il primo utente, che in HA è il padrone di casa. Torna il codice usa e
 * getta con cui ci si fa dare le chiavi vere.
 */
async function createOwner(config: ConnectorConfig): Promise<string> {
  const response = await ask(`${config.haUrl}/api/onboarding/users`, {
    method: 'POST',
    body: JSON.stringify({
      client_id: config.haUrl,
      name: config.haUser,
      username: config.haUser,
      password: config.haPassword,
      language: 'it',
    }),
  });

  if (!response.ok) {
    throw new Error(`home assistant non ha creato l'utente (risposta ${response.status}, ${await response.text()})`);
  }
  return ((await response.json()) as { auth_code: string }).auth_code;
}

/**
 * Rientra con nome e password, come farebbe una persona dalla pagina di
 * accesso, e torna lo stesso codice usa e getta che dà la creazione
 * dell'utente.
 *
 * Serve quando il primo avvio si è fermato a metà: l'utente è nato, ma il
 * token no. Senza questo, a ogni riavvio l'agente chiedeva un token scritto a
 * mano, anche se le chiavi per rientrare le aveva già.
 */
async function logIn(config: ConnectorConfig): Promise<string> {
  const start = await ask(`${config.haUrl}/auth/login_flow`, {
    method: 'POST',
    body: JSON.stringify({ client_id: config.haUrl, handler: ['homeassistant', null], redirect_uri: `${config.haUrl}/` }),
  });
  if (!start.ok) throw new Error(`home assistant non apre l'accesso (risposta ${start.status})`);
  const { flow_id: flowId } = (await start.json()) as { flow_id: string };

  const sent = await ask(`${config.haUrl}/auth/login_flow/${encodeURIComponent(flowId)}`, {
    method: 'POST',
    body: JSON.stringify({ client_id: config.haUrl, username: config.haUser, password: config.haPassword }),
  });
  const said = (await sent.json().catch(() => ({}))) as { type?: string; result?: string };
  if (!sent.ok || said.type !== 'create_entry' || !said.result) {
    throw new Error(`home assistant non accetta il nome "${config.haUser}" con la password che ho`);
  }
  return said.result;
}

/** Il codice usa e getta diventa un permesso vero, che dura mezz'ora. */
async function exchange(config: ConnectorConfig, code: string): Promise<string> {
  const response = await ask(`${config.haUrl}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: config.haUrl }).toString(),
  });

  if (!response.ok) throw new Error(`lo scambio del codice non è riuscito (risposta ${response.status})`);
  return ((await response.json()) as { access_token: string }).access_token;
}

/**
 * I passi che restano dopo l'utente. Nessuno di questi ci serve, ma lasciarli
 * a metà fa sì che HA continui a mostrare la procedura di benvenuto a chi
 * apre il browser — e lì ci deve entrare, per il QR di Tuya.
 */
async function finishSteps(config: ConnectorConfig, access: string, steps: Step[]): Promise<void> {
  const headers = { authorization: `Bearer ${access}` };
  const todo = steps.filter((step) => !step.done && step.step !== 'user').map((step) => step.step);

  for (const step of todo) {
    try {
      const body = step === 'integration' ? JSON.stringify({ client_id: config.haUrl, redirect_uri: `${config.haUrl}/` }) : '{}';
      await ask(`${config.haUrl}/api/onboarding/${step}`, { method: 'POST', headers, body });
    } catch {
      // Un passo di benvenuto che non va non è un motivo per non partire.
      console.warn(`passo "${step}" del benvenuto non riuscito, si tira avanti`);
    }
  }
}

/**
 * Il token che dura: si chiede dalla WebSocket, perché di là non si può.
 * Dieci anni, così non scade mentre non guardi.
 */
function mintLongLived(config: ConnectorConfig, access: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${config.haUrl.replace(/^http/, 'ws')}/api/websocket`);
    const fail = (why: string) => {
      socket.close();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('home assistant non ha risposto'), 30_000);

    socket.on('error', (error) => fail(error.message));
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;

      if (message.type === 'auth_required') {
        socket.send(JSON.stringify({ type: 'auth', access_token: access }));
      } else if (message.type === 'auth_ok') {
        socket.send(
          JSON.stringify({
            id: 1,
            type: 'auth/long_lived_access_token',
            client_name: `place-index ${config.name} ${Date.now()}`,
            lifespan: 3650,
          }),
        );
      } else if (message.type === 'auth_invalid') {
        clearTimeout(timer);
        fail('home assistant ha rifiutato il permesso appena dato');
      } else if (message.type === 'result') {
        clearTimeout(timer);
        if (message.success) {
          socket.close();
          resolve(message.result as string);
        } else {
          fail(`il token non è stato concesso (${JSON.stringify(message.error)})`);
        }
      }
    });
  });
}

/**
 * Il token da usare, da dove capita: quello scritto a mano nella config, uno
 * già guadagnato la volta scorsa, o — se HA è ancora vergine — uno preso
 * facendo da sé tutta la procedura di benvenuto.
 */
export async function ensureToken(config: ConnectorConfig): Promise<string> {
  if (config.haToken) return config.haToken;

  const saved = stateFile(config, TOKEN_FILE);
  try {
    const held = fs.readFileSync(saved, 'utf8').trim();
    if (held) return held;
  } catch {
    /* prima volta */
  }

  const steps = await waitForHa(config);
  const onboarded = steps.find((step) => step.step === 'user')?.done;

  if (onboarded && !config.haPassword) {
    throw new Error(
      'home assistant ha già un utente e noi non abbiamo il suo token. ' +
        'Creane uno di lunga durata dal tuo profilo e mettilo in HA_TOKEN',
    );
  }

  // Con un utente già nato si rientra con la password: è il caso del primo
  // avvio interrotto dopo la creazione, e dei passi rimasti si finisce qui.
  if (onboarded) console.log(`home assistant ha già un utente, rientro come "${config.haUser}"`);
  else console.log('home assistant è nuovo, faccio io il primo avvio');
  const access = await exchange(config, onboarded ? await logIn(config) : await createOwner(config));
  await finishSteps(config, access, steps);

  const token = await mintLongLived(config, access);
  fs.writeFileSync(saved, token, { encoding: 'utf8', mode: 0o600 });
  console.log(`home assistant pronto — entra come "${config.haUser}" per aggiungere Tuya`);
  return token;
}
