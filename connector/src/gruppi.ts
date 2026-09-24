import type { Capability, DeviceSnapshot, DeviceValue } from '../../shared/protocol.js';
import { elenco } from './domini/comune.js';
import { VOCI_ACCENSIONE } from './domini/lingua.js';
import { dominioDi, domainOf, formaDi, isOnline, misuraNota, nomeMisura, ruoloDi, stateOf, tradotto, translate } from './entities.js';
import type { HaEntity, Voce } from './homeassistant.js';

/**
 * Un dispositivo vero, con dentro le sue entità.
 *
 * Home Assistant descrive una presa Shelly con i consumi come due entità —
 * l'interruttore e il sensore della potenza — e una presa eWeLink con le sue
 * impostazioni come cinque. Prese una per una diventavano schede diverse, e
 * con cento marche le schede si moltiplicavano. Qui si rimettono insieme: una
 * entità principale, quella che si comanda, e attorno le letture e le
 * impostazioni dello stesso dispositivo.
 *
 * Le capacità che vengono da un'altra entità hanno il codice
 * `<entità>#<codice>`: l'agente sa a chi mandare il comando, e per il resto
 * del mondo è un nome come un altro. È così che una funzione nuova di una
 * marca che non conosciamo arriva fino allo schermo senza scrivere niente
 * per lei, come fa Alexa con i suoi comandi generici.
 */

/** Quale misura dà il nome a un dispositivo fatto solo di letture. */
const PRIMA = ['temperature', 'humidity', 'power', 'motion', 'door', 'window', 'moisture', 'smoke'];

export interface Gruppo {
  /** L'entità principale: il suo id resta l'id del dispositivo. */
  primaria: string;
  /** Le altre entità dello stesso dispositivo che ci stanno dentro. */
  accessori: string[];
  /** Come si chiama il dispositivo vero. */
  nome: string;
}

/** Chi è più nuovo fra due stati della stessa entità. Senza un'ora si crede a quello arrivato dopo. */
const piuNuovo = (arrivato: HaEntity, letto: HaEntity): boolean => {
  const a = Date.parse(arrivato.last_updated ?? '');
  const b = Date.parse(letto.last_updated ?? '');
  return !Number.isFinite(a) || !Number.isFinite(b) || a >= b;
};

/**
 * Lo stato di tutte le entità a un giro d'inventario: quello letto dalla
 * centrale, con sopra quello arrivato mentre si aspettava la risposta, se è
 * più nuovo. La fotografia può essere più vecchia di un cambiamento già
 * visto, e fidarsi solo di lei vorrebbe dire tornare indietro nel tempo.
 */
export function fotografia(letti: HaEntity[], arrivati: Map<string, HaEntity>): Map<string, HaEntity> {
  const stati = new Map(letti.map((entity) => [entity.entity_id, entity]));
  for (const [id, entity] of arrivati) {
    const letto = stati.get(id);
    if (!letto || piuNuovo(entity, letto)) stati.set(id, entity);
  }
  return stati;
}

/** Un'impostazione che sappiamo disegnare: lo dice il suo dominio (connector/src/domini/). */
const impostazione = (voce: Voce): boolean => voce.category === 'config' && !!dominioDi(voce.entityId)?.impostazione;
const lettura = (voce: Voce): boolean => !voce.category && ruoloDi(voce.entityId) === 'lettura';
const principale = (voce: Voce): boolean => !voce.category && ruoloDi(voce.entityId) === 'principale';
const comando = (voce: Voce): boolean => !voce.category && ruoloDi(voce.entityId) === 'comando';

/**
 * Chi sta con chi.
 *
 * Un dispositivo con una sola cosa da comandare diventa una scheda sola,
 * con dentro letture e impostazioni. Uno che ne ha più d'una — un relè a
 * quattro canali — resta diviso, un canale per scheda, come prima: di quale
 * canale sia la lettura dei consumi non si può sapere, e le impostazioni
 * restano fuori. Uno fatto solo di letture — una sonda di temperatura e
 * umidità — diventa una scheda con tutte e due.
 */
export function raggruppa(voci: Voce[], stati: Map<string, HaEntity>): Gruppo[] {
  const perDispositivo = new Map<string, Voce[]>();
  for (const voce of voci) {
    if (!stati.has(voce.entityId)) continue;
    /*
     * Un'entità che non sta su nessun dispositivo — un interruttore creato
     * nella centrale, una sonda scritta a mano, una persona — è un
     * dispositivo da sola. Ma solo se è una cosa che si comanda o che si
     * legge: un pulsante o una scena senza dispositivo sono della centrale
     * stessa, e non di qualcosa che sta in casa. E non se viene da
     * un'integrazione che è un servizio (l'ora, la data, il sole): quella
     * non porta cose di casa, ma notizie sul mondo. Che abbia un nome
     * interno stabile lo garantisce l'anagrafe (homeassistant.ts).
     */
    if (!voce.deviceId && (voce.servizio || (!principale(voce) && !lettura(voce)))) continue;
    const chiave = voce.deviceId || `entita:${voce.entityId}`;
    perDispositivo.set(chiave, [...(perDispositivo.get(chiave) ?? []), voce]);
  }

  const gruppi: Gruppo[] = [];
  for (const suoi of perDispositivo.values()) {
    const ordinati = [...suoi].sort((a, b) => a.entityId.localeCompare(b.entityId));
    const nome = ordinati[0]?.deviceName ?? '';
    const vale = (voce: Voce): boolean => !!translate(stati.get(voce.entityId), voce);

    /*
     * Da un servizio — il sole, i backup, le scene di una marca — entra solo
     * quello che si comanda. Le sue letture sono l'ora dell'alba e lo stato
     * dei backup, e su una mappa di case sono rumore.
     */
    const servizio = ordinati.some((voce) => voce.servizio);
    const principali = ordinati.filter((voce) => principale(voce) && vale(voce));
    const letture = servizio ? [] : ordinati.filter((voce) => lettura(voce) && vale(voce));
    const comandi = ordinati.filter((voce) => comando(voce) && vale(voce));
    const impostazioni = servizio ? [] : ordinati.filter(impostazione);

    if (principali.length === 1) {
      const [sola] = principali as [Voce];
      gruppi.push({
        primaria: sola.entityId,
        accessori: [...letture, ...comandi, ...impostazioni].map((voce) => voce.entityId),
        nome,
      });
    } else if (principali.length > 1) {
      for (const voce of [...principali, ...letture, ...comandi]) gruppi.push({ primaria: voce.entityId, accessori: [], nome });
    } else if (comandi.length && !letture.length) {
      // solo comandi — un cancello con il suo pulsante, le scene della marca — e il primo fa da dispositivo
      const [primo, ...altri] = comandi as [Voce, ...Voce[]];
      gruppi.push({ primaria: primo.entityId, accessori: [...altri, ...impostazioni].map((voce) => voce.entityId), nome });
    } else if (letture.length) {
      // la scheda prende il nome della misura che conta di più, non della prima in ordine alfabetico
      const peso = (voce: Voce): number => {
        const misura = String(stati.get(voce.entityId)?.attributes.device_class ?? '');
        const at = PRIMA.indexOf(misura);
        return at < 0 ? PRIMA.length : at;
      };
      const [prima, ...altre] = [...letture].sort((a, b) => peso(a) - peso(b)) as [Voce, ...Voce[]];
      gruppi.push({
        primaria: prima.entityId,
        accessori: [...altre, ...comandi, ...impostazioni].map((voce) => voce.entityId),
        nome,
      });
    }
  }
  return gruppi;
}


/**
 * I nomi delle impostazioni più comuni, detti in italiano, per quando la
 * centrale non ha la traduzione. Solo parole che usano tutti — la luce spia,
 * il blocco bambini — e non i nomi interni di una marca: quelli, se la
 * marca li traduce, arrivano già dalle traduzioni della centrale.
 */
const DIZIONARIO: Record<string, string> = {
  led: 'Luce spia',
  indicator: 'Luce spia',
  backlight: 'Retroilluminazione',
  child_lock: 'Blocco bambini',
  'child lock': 'Blocco bambini',
  power_on_behavior: 'Dopo un blackout',
  'power on behavior': 'Dopo un blackout',
};

/** Le voci di un selettore dello stato dopo un blackout, come le chiama la centrale. */
const BLACKOUT = new Set(Object.keys(VOCI_ACCENSIONE));

const pulito = (testo: string): string => testo.trim().toLowerCase();

/** Un nome della centrale senza il nome del dispositivo davanti, che sulla scheda c'è già. */
const senzaDispositivo = (voce: Voce, intero: string): string =>
  (voce.deviceName && intero.startsWith(voce.deviceName) ? intero.slice(voce.deviceName.length) : intero).trim();

/** Il nome che l'entità ha nella centrale, senza il nome del dispositivo davanti. */
const nomeSenzaDispositivo = (voce: Voce, entity: HaEntity): string =>
  senzaDispositivo(voce, voce.originalName ?? String(entity.attributes.friendly_name ?? ''));

const maiuscola = (testo: string): string => testo.charAt(0).toLocaleUpperCase('it') + testo.slice(1);

/** Il nome scelto da chi usa l'app, se l'ha scelto. */
const nomeScelto = (voce: Voce): string => {
  const scelto = voce.name ? senzaDispositivo(voce, voce.name) || voce.name : '';
  return scelto ? maiuscola(scelto) : '';
};

/** Il nome che l'integrazione dà all'entità, in italiano se lo sa. */
const nomeTradotto = (voce: Voce): string | undefined =>
  voce.translationKey ? tradotto(`component.${voce.platform}.entity.${domainOf(voce.entityId)}.${voce.translationKey}.name`) : undefined;

/**
 * Come si chiama un'entità da sola: il nome scelto, quello tradotto, quello
 * della centrale senza il dispositivo davanti, e se non resta niente il nome
 * del dispositivo, che vuol dire che l'entità è il dispositivo.
 */
function nomeEntita(voce: Voce, entity: HaEntity): string {
  const senza = nomeSenzaDispositivo(voce, entity);
  return nomeScelto(voce) || nomeTradotto(voce) || (senza ? maiuscola(senza) : '') || voce.deviceName;
}

/**
 * Come si chiama una capacità che viene da un'altra entità.
 *
 * Prima il nome che le ha dato chi usa l'app nella centrale: l'ha scelto
 * lui, e vale più di ogni nostra idea. Poi la parola della centrale per le
 * misure — «Temperatura» dice più di qualunque altro nome — poi la
 * traduzione dell'integrazione, poi il nostro dizionario, e per ultimo il
 * nome che l'entità ha nella centrale, senza il nome del dispositivo davanti.
 */
export function etichetta(voce: Voce, entity: HaEntity): string {
  const scelto = nomeScelto(voce);
  if (scelto) return scelto;

  if (ruoloDi(voce.entityId) === 'lettura' && misuraNota(entity)) return nomeMisura(entity);

  const tradotta = nomeTradotto(voce);
  if (tradotta) return tradotta;

  const senza = nomeSenzaDispositivo(voce, entity);
  const nostra = DIZIONARIO[pulito(voce.translationKey ?? '')] ?? DIZIONARIO[pulito(senza)];
  if (nostra) return nostra;
  if (senza) return maiuscola(senza);

  /*
   * Senza un nome, a volte il nome lo dicono le voci. Un elenco che sa solo
   * «acceso», «spento» e «com'era» è lo stato dopo un blackout, anche
   * quando l'integrazione non lo chiama in nessun modo.
   */
  const voci = elenco(entity, 'options')?.map(pulito);
  if (voci?.length && voci.every((one) => BLACKOUT.has(one))) return 'Dopo un blackout';
  return 'Valore';
}

/**
 * Le capacità di un'entità che sta dentro un altro dispositivo, con il
 * codice che dice di chi sono. Sono le stesse che avrebbe da sola: una
 * levetta, un numero o un elenco sono la stessa cosa da impostazione e da
 * comando, e cambia solo dove si disegnano e come si chiamano.
 *
 * Un comando che ha un suo «acceso» — il telecomando dentro una TV — non ne
 * aggiunge un secondo a un dispositivo che ce l'ha già: sarebbero due
 * levette per la stessa cosa. Resta il resto, con i suoi nomi.
 */
function capacitaAccessorio(voce: Voce, entity: HaEntity, giaAcceso: boolean): Capability[] {
  const code = (interno: string): string => `${voce.entityId}#${interno}`;
  const label = etichetta(voce, entity);
  const impostazione = voce.category === 'config';
  const doppione = (capability: Capability): boolean => giaAcceso && !impostazione && capability.code === 'power';

  // la prima prende il nome dell'entità; le altre, se ce ne sono, tengono il loro
  const out: Capability[] = [];
  formaDi(entity, voce).capabilities.forEach((capability, at) => {
    if (doppione(capability)) return;
    out.push({
      ...capability,
      code: code(capability.code),
      // l'interruttore che accende è della stessa entità, e si chiama come lei
      ...('accende' in capability && capability.accende ? { accende: code(capability.accende) } : {}),
      label: at === 0 ? label : capability.label,
      ...(impostazione ? { setting: true } : {}),
    });
  });
  return out;
}

/**
 * Com'è adesso un dispositivo: se risponde, e i valori dell'entità
 * principale con dentro quelli delle altre, con i codici loro. Solo i valori
 * di capacità che il dispositivo ha. È quello che si manda a ogni
 * cambiamento, e si rifà senza ricalcolare la forma. Lo stato di ogni entità
 * si legge una volta sola finché lei non cambia (entities.ts): a ogni
 * cambiamento si rilegge solo quella cambiata.
 */
export function statoGruppo(
  gruppo: Gruppo,
  stati: Map<string, HaEntity>,
  capabilities: Capability[],
): { online: boolean; state: Record<string, DeviceValue> } | null {
  const principale = stati.get(gruppo.primaria);
  if (!principale) return null;
  const codici = new Set(capabilities.map((capability) => capability.code));
  const state: Record<string, DeviceValue> = {};
  const metti = (prefisso: string, entity: HaEntity): void => {
    for (const [chiave, valore] of Object.entries(stateOf(entity))) {
      const code = prefisso + chiave;
      if (codici.has(code)) state[code] = valore;
    }
  };
  metti('', principale);
  for (const id of gruppo.accessori) {
    const entity = stati.get(id);
    if (entity) metti(`${id}#`, entity);
  }
  return { online: isOnline(principale), state };
}

/**
 * Il dispositivo di un gruppo, com'è adesso: quello che dice l'entità
 * principale, con dentro le capacità e i valori delle altre.
 */
export function componi(gruppo: Gruppo, stati: Map<string, HaEntity>, voci: Map<string, Voce>): DeviceSnapshot | null {
  // fra un giro d'inventario e l'altro l'entità principale può non esserci
  // ancora, o non più: allora il dispositivo non c'è, e non è un errore
  const principale = stati.get(gruppo.primaria);
  const voce = voci.get(gruppo.primaria);
  const base = translate(principale, voce);
  if (!base || !principale) return null;

  const capabilities = [...base.capabilities];
  const giaAcceso = capabilities.some((capability) => capability.code === 'power');
  const dentro: string[] = [];

  for (const id of gruppo.accessori) {
    const entity = stati.get(id);
    const sua = voci.get(id);
    if (!entity || !sua) continue;
    const sue = capacitaAccessorio(sua, entity, giaAcceso);
    if (!sue.length) continue;
    capabilities.push(...sue);
    // una lettura poteva essere un dispositivo a sé: il backend ci sposta sopra quello che la nominava
    if (!sua.category) dentro.push(id);
  }

  /*
   * Più di un interruttore di tutti i giorni sullo stesso dispositivo — una
   * TV con il muto, un ventilatore con l'oscillazione — e «Acceso» non dice
   * più quale: il sito scriverebbe «Accendi Acceso». Allora ognuno porta il
   * nome della sua cosa, e quello principale il nome dell'entità principale.
   */
  const interruttori = capabilities.filter((capability) => capability.kind === 'switch' && !capability.setting);
  const nome = (voce ? nomeEntita(voce, principale) : '') || base.name;
  const conNomi =
    interruttori.length > 1
      ? capabilities.map((capability) => (capability.code === 'power' ? { ...capability, label: nome } : capability))
      : capabilities;

  const adesso = statoGruppo(gruppo, stati, conNomi);
  return {
    ...base,
    capabilities: conNomi,
    online: adesso?.online ?? base.online,
    state: adesso?.state ?? base.state,
    ...(dentro.length ? { absorbs: dentro } : {}),
  };
}
