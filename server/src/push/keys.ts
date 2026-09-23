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
  /** A chi scrivere se un servizio di consegna ha qualcosa da ridire. */
  subject: string;
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
    held = { ...made, subject: 'mailto:avvisi@place-index.invalid' };

    await fs.mkdir(config.dataDir, { recursive: true });
    // Prima accanto e poi rinominato: un'interruzione a metà non deve
    // lasciare mezza chiave, che sarebbe peggio di nessuna chiave.
    const scratch = `${where()}.tmp`;
    await fs.writeFile(scratch, JSON.stringify(held, null, 2), 'utf8');
    await fs.rename(scratch, where());
  }

  webpush.setVapidDetails(held.subject, held.publicKey, held.privateKey);
  return held;
}
