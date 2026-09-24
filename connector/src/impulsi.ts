import { Ricordi } from './ricordi.js';
import { dominioDi } from './entities.js';
import type { HaEntity } from './homeassistant.js';

/**
 * Quali interruttori sono a impulso, e quanto dura l'impulso.
 *
 * Una presa in modalità impulso si accende e dopo mezzo secondo si spegne da
 * sola: comanda un relè passo-passo o un cancello, e ogni impulso cambia lo
 * stato di quello che c'è dietro. La centrale la vede come un interruttore
 * qualunque che torna spento subito, e «Spegni» non fa niente.
 *
 * Non lo si chiede alla marca: lo si guarda succedere. Un interruttore che
 * torna spento da solo pochi secondi dopo essersi acceso, senza che nessuno
 * l'abbia chiesto, è a impulso, e l'impulso dura quanto è rimasto acceso.
 * Vale per qualunque marca, anche per una che non conosciamo. Lo si crede
 * quando lo si vede due volte di fila con la stessa durata, e la seconda
 * entro un giorno dalla prima: un relè a impulso è preciso al decimo di
 * secondo, una mano che accende e spegne una lampada dal muro no. «Di fila»
 * vuol dire senza niente in mezzo che lo smentisca: una persona che spegne,
 * un nostro spegnimento, un acceso durato più di un impulso. Poi si ricorda
 * in un file dell'agente, e se un giorno resta acceso a lungo non lo è più.
 *
 * Quello che ne esce è il campo `pulse` dell'interruttore, che il sito sa
 * già disegnare.
 */

/** Fin dove un acceso-spento da solo è un impulso: oltre, è qualcuno che ha spento. */
export const IMPULSO_MAX_MS = 10_000;
/** Acceso per più di così vuol dire che non torna spento da solo: non è a impulso. */
export const LUNGO_MS = 60_000;
/** Una durata si arrotonda a questo, perché ogni impulso misurato è diverso di qualche millesimo. */
const PASSO_MS = 100;
/**
 * Quanto possono differire due misure dello stesso impulso: un relè è
 * preciso al decimo di secondo, e il resto è il ritardo con cui la centrale
 * se ne accorge. Oltre, non sono lo stesso impulso.
 */
const SCARTO_MS = 150;
/** Entro quanto la seconda misura deve confermare la prima: più in là, sono due cose a caso. */
const CONFERMA_MS = 24 * 60 * 60_000;

/**
 * Cosa si è capito guardando un cambiamento: un impulso di quella durata
 * (`at` è quando), che non è a impulso, o un acceso-spento che non è un
 * impulso e che quindi smentisce quello visto prima.
 */
export type Esito = { impara: number; at?: number } | { dimentica: true } | { smentisce: true } | null;

const quando = (entity: HaEntity): number => Date.parse(entity.last_changed ?? entity.last_updated ?? '');

/**
 * Se un cambiamento dice qualcosa sull'impulso.
 *
 * Il `context` di un cambiamento dice chi l'ha fatto: con `user_id` è una
 * persona o noi, con `parent_id` un'automazione. Senza nessuno dei due l'ha
 * fatto il dispositivo da solo. `nostro` dice se lo spegnimento l'abbiamo
 * chiesto noi, per quando il contesto non basta a capirlo.
 */
export function osserva(prima: HaEntity | null, dopo: HaEntity, nostro: boolean): Esito {
  // solo chi ha un interruttore può essere a impulso, e lo dice il suo dominio (connector/src/domini/)
  if (!dominioDi(dopo.entity_id)?.accendibile) return null;
  if (prima?.state !== 'on' || dopo.state !== 'off') return null;

  const acceso = quando(dopo) - quando(prima);
  if (!Number.isFinite(acceso) || acceso < 0) return null;
  if (acceso > LUNGO_MS) return { dimentica: true };

  const daSolo = !dopo.context?.user_id && !dopo.context?.parent_id && !nostro;
  if (daSolo && acceso <= IMPULSO_MAX_MS) {
    return { impara: Math.max(PASSO_MS, Math.round(acceso / PASSO_MS) * PASSO_MS), at: quando(dopo) };
  }
  return { smentisce: true };
}

/**
 * Gli impulsi imparati, e il file dove restano da un avvio all'altro.
 *
 * Il file è dell'agente, accanto al token della centrale: chi reinstalla
 * l'agente li reimpara alla prima pressione.
 */
export class Impulsi {
  #durate = new Map<string, number>();
  /** Il primo impulso visto, e quando, in attesa del secondo che lo conferma. */
  #candidati = new Map<string, { ms: number; at: number }>();

  #file: Ricordi<number>;

  constructor(file: string) {
    this.#file = new Ricordi(file, 'impulsi', (ms): ms is number => typeof ms === 'number' && ms > 0);
    this.#durate = this.#file.leggi();
  }

  get(entityId: string): number | undefined {
    return this.#durate.get(entityId);
  }

  /** Applica quello che si è capito. Torna vero se è cambiato qualcosa da dire. */
  applica(entityId: string, esito: Esito): boolean {
    if (!esito) return false;
    if ('smentisce' in esito) {
      this.#candidati.delete(entityId);
      return false;
    }
    if ('dimentica' in esito) {
      this.#candidati.delete(entityId);
      if (!this.#durate.delete(entityId)) return false;
      console.log(`${entityId}: resta acceso a lungo, non è più a impulso`);
      this.#salva();
      return true;
    }

    // una durata già nota, misurata di nuovo: non c'è niente da dire
    const prima = this.#durate.get(entityId);
    const at = esito.at ?? Date.now();
    if (prima !== undefined && Math.abs(prima - esito.impara) <= SCARTO_MS) {
      this.#candidati.delete(entityId);
      return false;
    }
    // una nuova, o diversa da quella nota, vale solo confermata: una misura storta non riscrive niente
    const visto = this.#candidati.get(entityId);
    const conferma = visto && Math.abs(visto.ms - esito.impara) <= SCARTO_MS && at - visto.at <= CONFERMA_MS;
    if (!conferma) {
      this.#candidati.set(entityId, { ms: esito.impara, at });
      return false;
    }
    this.#candidati.delete(entityId);
    this.#durate.set(entityId, esito.impara);
    console.log(`${entityId}: torna spento da solo dopo ${esito.impara} ms, è a impulso`);
    this.#salva();
    return true;
  }

  #salva(): void {
    this.#file.salvaSubito(() => this.#durate);
  }
}
