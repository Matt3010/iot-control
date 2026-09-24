/**
 * Chi smista i flussi video, qui accanto sulla stessa macchina.
 *
 * Non è un servizio nostro: è quello che Home Assistant si porta dietro per i
 * video, e risponde solo da dentro casa. Qui ci sono le quattro cose che gli
 * si chiedono — da dove guarda una telecamera, apri questo flusso, dammi un
 * fotogramma, chiudi — e stanno in un posto solo perché l'indirizzo di quella
 * porta scritto in due file è l'inizio di due file che un giorno diranno
 * cose diverse.
 */

const BASE = 'http://127.0.0.1:11984/api';
const STREAMS = `${BASE}/streams`;

/** Quanto si aspetta una risposta locale: è qui accanto, o non c'è. */
const NEARBY_MS = 5_000;

/**
 * Quanto si aspetta un fotogramma. Di più, perché prima di poterne disegnare
 * uno si aspetta un fotogramma chiave, e su certi registratori ne passa uno
 * ogni pochi secondi.
 */
const FRAME_MS = 20_000;

/**
 * I flussi che abbiamo già aperto, e con quale indirizzo.
 *
 * Riaprirlo a ogni fotogramma sarebbe una richiesta in più ogni cinque
 * secondi per dire una cosa che è già vera. Se poi il fotogramma non arriva,
 * il ricordo si butta: forse di là hanno riavviato, e al giro dopo si riapre.
 */
const known = new Map<string, string>();

/** L'indirizzo vero di una telecamera, come lo conosce chi smista i flussi. */
export async function sourceOf(entityId: string): Promise<string | undefined> {
  return askSource(entityId).catch(() => undefined);
}

/**
 * Come `sourceOf`, ma se chi smista i flussi non risponde lo dice invece di
 * tornare vuoto. Serve a chi si ricorda la risposta: «non ha un indirizzo» si
 * può tenere da parte, «non ho potuto chiederlo» no, se no una telecamera
 * resta senza controllo per colpa di un attimo in cui lui era giù.
 */
export async function askSource(entityId: string): Promise<string | undefined> {
  const said = await fetch(`${STREAMS}?src=${encodeURIComponent(entityId)}`, {
    signal: AbortSignal.timeout(NEARBY_MS),
  });
  // un flusso che non conosce è un'assenza vera, il resto è un guasto suo
  if (said.status === 404) return undefined;
  if (!said.ok) throw new Error(`chi smista i flussi risponde ${said.status}`);

  const info = (await said.json().catch(() => undefined)) as { producers?: { url?: string }[] } | undefined;
  for (const one of info?.producers ?? []) {
    const url = one.url ?? '';
    const bare = url.startsWith('ffmpeg:') ? url.slice('ffmpeg:'.length) : url;
    // via i parametri di ffmpeg: al client nativo non dicono niente
    const clean = bare.split('#')[0] ?? '';
    if (clean.startsWith('rtsp://')) return clean;
  }
  return undefined;
}

/**
 * Da quale canale guarda, detto in breve.
 *
 * Un registratore con quattro telecamere risponde a un indirizzo solo, e
 * quello che distingue le sue immagini è la coda: `/video1`, `/video2`. È
 * anche esattamente quello che la persona ha scritto per collegarle, quindi
 * lo riconosce.
 */
export async function channelOf(entityId: string): Promise<string | undefined> {
  const raw = await sourceOf(entityId);
  if (!raw) return undefined;

  try {
    const where = new URL(raw);
    return `${where.hostname}${where.pathname}`;
  } catch {
    return undefined;
  }
}

/** Apri questo flusso con questo nome, se non è già aperto così. */
export async function remember(name: string, src: string): Promise<boolean> {
  if (known.get(name) === src) return true;

  const set = await fetch(`${STREAMS}?name=${encodeURIComponent(name)}&src=${encodeURIComponent(src)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(NEARBY_MS),
  }).catch(() => undefined);
  if (!set?.ok) return false;

  known.set(name, src);
  return true;
}

/** Chiudilo: un flusso aperto per nessuno costa banda e un pezzo di macchina. */
export async function forget(name: string): Promise<void> {
  known.delete(name);
  await fetch(`${STREAMS}?src=${encodeURIComponent(name)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(NEARBY_MS),
  }).catch(() => undefined);
}

/** Un fotogramma da un flusso già aperto. */
export async function frameOf(name: string): Promise<Buffer | undefined> {
  const shot = await fetch(`${BASE}/frame.jpeg?src=${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(FRAME_MS),
  }).catch(() => undefined);

  if (!shot?.ok) {
    // Forse di là hanno riavviato: il ricordo si butta, e al giro dopo si riapre.
    known.delete(name);
    return undefined;
  }

  const bytes = Buffer.from(await shot.arrayBuffer());
  return bytes.length ? bytes : undefined;
}

/** Dove scorre un flusso, fotogramma dopo fotogramma. */
export const flowing = (name: string): string => `${BASE}/stream.mjpeg?src=${encodeURIComponent(name)}`;
