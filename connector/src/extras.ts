import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConnectorConfig } from './config.js';

/**
 * Quello che Home Assistant non sa fare da solo.
 *
 * Di serie HA parla con Tuya, ma di eWeLink non sa niente: per quello serve
 * un'integrazione di terze parti, e la si installa mettendo dei file dentro
 * la sua configurazione. Qui si fa quello, e si fa **solo quando serve** —
 * nessuno scarica codice altrui su una macchina per un'integrazione che non
 * userà mai.
 *
 * La versione è fissata, non "l'ultima": una macchina in casa deve fare la
 * stessa cosa oggi e fra sei mesi, e un aggiornamento che rompe si sceglie,
 * non si subisce.
 */

export interface Extra {
  /** Come lo chiama HA quando lo elenca fra quelli collegabili. */
  domain: string;
  /** Come lo chiamiamo noi, quando lo diciamo a una persona. */
  label: string;
  repo: string;
  ref: string;
  /** La cartella dentro al repo da copiare. */
  source: string;
}


/**
 * Quanto si aspetta GitHub, per ogni domanda. Senza un limite una rete che
 * si pianta a metà lascerebbe l'installazione appesa per sempre, e chi sta
 * guardando la finestra non saprebbe mai che non arriva.
 */
const GITHUB_MS = 30_000;

interface Entry {
  name: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

async function listing(extra: Extra, inside: string): Promise<Entry[]> {
  const url = `https://api.github.com/repos/${extra.repo}/contents/${inside}?ref=${extra.ref}`;
  const response = await fetch(url, {
    headers: { accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(GITHUB_MS),
  });
  if (!response.ok) throw new Error(`GitHub risponde ${response.status} per ${inside}`);
  return (await response.json()) as Entry[];
}

/** Scarica una cartella intera, un file per volta: niente zip da sbrogliare. */
async function copyTree(extra: Extra, inside: string, into: string): Promise<number> {
  await fs.mkdir(into, { recursive: true });
  let written = 0;

  for (const entry of await listing(extra, inside)) {
    const here = path.join(into, entry.name);

    if (entry.type === 'dir') {
      written += await copyTree(extra, `${inside}/${entry.name}`, here);
      continue;
    }
    if (!entry.download_url) continue;

    const file = await fetch(entry.download_url, { signal: AbortSignal.timeout(GITHUB_MS) });
    if (!file.ok) throw new Error(`GitHub risponde ${file.status} per ${entry.name}`);
    await fs.writeFile(here, Buffer.from(await file.arrayBuffer()));
    written += 1;
  }
  return written;
}

const folderFor = (config: ConnectorConfig, domain: string): string =>
  path.join(config.haConfigDir, 'custom_components', domain);

/** C'è già, e nella versione che vogliamo? */
export async function installed(config: ConnectorConfig, extra: Extra): Promise<boolean> {
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(folderFor(config, extra.domain), 'manifest.json'), 'utf8'),
    ) as { version?: string };
    return manifest.version === extra.ref.replace(/^v/, '');
  } catch {
    return false;
  }
}

/**
 * Mette i file al loro posto e chiede a HA di riavviarsi, che è l'unico modo
 * perché si accorga di un'integrazione nuova. Torna quando ha chiesto, non
 * quando HA è tornato: quello lo aspetta chi guarda.
 */
export async function install(config: ConnectorConfig, extra: Extra): Promise<void> {
  const into = folderFor(config, extra.domain);

  // si scrive accanto e si sposta: un download a metà non lascia
  // un'integrazione monca dentro la configurazione di HA
  const scratch = `${into}.nuovo`;
  await fs.rm(scratch, { recursive: true, force: true });

  const files = await copyTree(extra, extra.source, scratch);
  if (!files) throw new Error(`Per ${extra.label} non c'è niente da installare`);

  await fs.rm(into, { recursive: true, force: true });
  await fs.rename(scratch, into);
  console.log(`${extra.label}: ${files} file installati (${extra.ref})`);

  const response = await fetch(`${config.haUrl}/api/services/homeassistant/restart`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.haToken}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`il servizio in casa non si riavvia (risposta ${response.status})`);
  console.log('home assistant si sta riavviando');
}
