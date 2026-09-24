import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { HaEntity } from '../homeassistant.js';

/**
 * Com'è fatto un dominio della centrale per l'agente. Esiste perché ogni
 * dominio diceva le sue cose in tre posti lontani — le capacità, lo stato, i
 * comandi — e una voce aggiunta in uno si dimenticava negli altri. Qui le tre
 * cose stanno insieme, in un file per famiglia (connector/src/domini/), e un
 * dominio nuovo è quel file più una riga nella tabella (domini/index.ts).
 */

/**
 * Che parte fa un dominio in un dispositivo vero (connector/src/gruppi.ts).
 * `principale` è una cosa che si comanda e che fa da dispositivo; `comando`
 * si comanda ma sta dentro al dispositivo a cui appartiene (un pulsante, una
 * scena della marca, il telecomando di una TV); `lettura` si guarda, e sta
 * con il dispositivo di cui misura qualcosa.
 */
export type Ruolo = 'principale' | 'comando' | 'lettura';

/** Da dove viene un'entità: serve a trovare le parole che le dà la sua integrazione. */
export interface Origine {
  platform: string;
  translationKey: string | null;
}

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/**
 * Quello che un comando diventa: una chiamata alla centrale; un valore che
 * tiene l'agente e che non va da nessuna parte (il tono di una sirena); il
 * pezzo che manca per poterlo fare, detto con una frase; o niente, quando non
 * è una cosa che quel dispositivo sa fare.
 */
export type Comando = ServiceCall | { preferenza: Record<string, DeviceValue> } | { manca: string } | null;

/** Quello che serve a un dominio per dire com'è fatta e com'è un'entità. */
export interface Contesto {
  entity: HaEntity;
  origine: Origine | undefined;
  /**
   * La forma dell'ultima volta che lo stato si sapeva: serve per il solo
   * caso in cui la forma non si capisce da nient'altro (un sensore senza
   * unità e senza tipo, domini/letture.ts).
   */
  prima: Capability[] | undefined;
  /** I valori che tiene l'agente per questa entità (il tono di una sirena). */
  preferenze: Record<string, DeviceValue>;
  /** Quando lo stato di adesso è arrivato all'agente, se l'ha visto arrivare. */
  arrivo: number | undefined;
}

/** Quello che serve a un comando: l'entità com'è adesso, se si sa, e quello che se ne ricorda. */
export interface ContestoComando {
  entityId: string;
  entity: HaEntity | undefined;
  /** L'ultimo valore conosciuto di ogni codice, per ripetere quello che il comando non cambia. */
  ricordo: Record<string, DeviceValue>;
  preferenze: Record<string, DeviceValue>;
}

export interface Dominio {
  ruolo: Ruolo;
  /** Se, fra le impostazioni di un dispositivo, sappiamo disegnarlo: una levetta, un numero, un elenco, un tasto. */
  impostazione?: boolean;
  /** Se ha un interruttore che può essere a impulso (connector/src/impulsi.ts). */
  accendibile?: boolean;
  /** Se dice una parola per pochi secondi e poi torna muto, come un campanello (index.ts). */
  evento?: boolean;
  /** Come si chiama una sua lettura quando la centrale non sa dire cosa misura. */
  nomeLettura?: string;
  /** Le capacità, dalla forma dell'entità e mai dal valore di adesso. */
  capacita(ctx: Contesto): Capability[];
  /** I valori di adesso; un codice che non si sa si lascia fuori. */
  stato(ctx: Contesto): Record<string, DeviceValue>;
  /** Un comando per ogni codice che si comanda; un codice che non c'è è una cosa che non sa fare. */
  comandi: Record<string, (ctx: ContestoComando, valore: DeviceValue) => Comando>;
}
