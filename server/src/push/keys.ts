import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';
import { config } from '../config.js';

/**
 * Le chiavi con cui si firmano le notifiche.
 *
 * Una notifica push non parte da noi: la consegna il servizio del telefono —
 * Google, Apple, Mozilla — e per accettarla da noi vuole sapere che siamo
 * sempre gli stessi. Questa coppia di chiavi è quel «sempre gli stessi»: la
 * pubblica finisce nel browser quando si iscrive, la privata firma ogni invio
 * e non esce da questa macchina.
 *
 * Si generano da sole alla prima accensione e restano nel file. Non sono una
 * configurazione da chiedere a nessuno: chi installa questo non deve sapere
 * cos'è una chiave VAPID, e una cosa che si può generare non si chiede.
 *
 * Cambiarle vuol dire buttare via tutte le iscrizioni esistenti — i telefoni
 * sono iscritti *a quella* chiave pubblica — quindi il file non si tocca.
 */
export interface PushKeys {
  publicKey: string;
  privateKey: string;
  /**
   * Chi siamo, per il servizio di consegna. Sta nel file per le installazioni
   * vecchie, ma non si usa più da lì: vedi `subject()`.
   */
  subject?: string;
}

/**
 * L'indirizzo del sito, imparato dalla prima richiesta che arriva.
 *
 * Serve a firmare le notifiche, e non si può sapere da qui: questo
 * programma gira dietro un tunnel, dentro un container, e il nome con cui lo
 * si raggiunge lo conosce solo chi bussa. Chiederlo a chi installa sarebbe
 * una domanda in più a cui si può rispondere da soli.
 */
let bussato = '';

export function noteOrigin(host: string | undefined): void {
  if (bussato || !host) return;
  // da fuori si arriva sempre in https; in casa, sviluppando, no
  const locale = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host);
  bussato = `${locale ? 'http' : 'https'}://${host}`;
}

/**
 * Con che nome ci si presenta al servizio di consegna.
 *
 * Deve essere un indirizzo vero — una pagina o una casella di posta — e
 * Apple lo controlla davvero: con un dominio inventato risponde 403 e la
 * notifica non parte, mentre Google la lascia passare lo stesso. Il primo
 * iPhone iscritto qui non ha ricevuto niente proprio per questo.
 */
export function subject(): string {
  return process.env.PUSH_SUBJECT || bussato || 'https://github.com/place-index';
}

const where = (): string => path.join(config.dataDir, 'push.json');

let held: PushKeys | null = null;

export async function pushKeys(): Promise<PushKeys> {
  if (held) return held;

  try {
    held = JSON.parse(await fs.readFile(where(), 'utf8')) as PushKeys;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;

    const made = webpush.generateVAPIDKeys();
    held = { ...made };

    await fs.mkdir(config.dataDir, { recursive: true });
    // Prima accanto e poi rinominato: un'interruzione a metà non deve
    // lasciare mezza chiave, che sarebbe peggio di nessuna chiave.
    const scratch = `${where()}.tmp`;
    await fs.writeFile(scratch, JSON.stringify(held, null, 2), 'utf8');
    await fs.rename(scratch, where());
  }

  return held;
}
