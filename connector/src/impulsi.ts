import type { HomeAssistant } from './homeassistant.js';

/**
 * Quali interruttori sono a impulso, e quanto dura l'impulso.
 *
 * Una presa in modalità impulso («inching») si accende e dopo mezzo secondo
 * si spegne da sola: comanda un relè passo-passo o un cancello, e ogni
 * impulso cambia lo stato di quello che c'è dietro. Home Assistant la vede
 * come un interruttore qualunque che torna spento subito, e «Spegni» non fa
 * niente. Il provider lo sa, ma l'integrazione non lo trasforma in
 * un'entità: si legge dai suoi dati di diagnostica.
 *
 * Qui dentro c'è una parte per ogni provider — come si chiama la sua
 * integrazione, e come si leggono i suoi dati — e tutto il resto è in
 * comune: la domanda alla centrale, e cosa diventa la risposta (il campo
 * `pulse` dell'interruttore, che il sito sa già disegnare). Un provider in
 * più è un lettore in più nella sua voce di `providers.ts`, e basta.
 */

/** Un'entità dell'integrazione, con il nome interno che le dà lei. */
export interface EntitaDiProvider {
  entityId: string;
  uniqueId: string;
}

export interface LettoreImpulsi {
  /** Come si chiama l'integrazione in Home Assistant. */
  piattaforma: string;
  /**
   * Dai dati di diagnostica di un collegamento, quali entità sono a impulso
   * e per quanti millisecondi. Quello che non si capisce si lascia fuori:
   * un interruttore normale scambiato per un impulso smetterebbe di potersi
   * spegnere.
   */
  leggi(diagnostica: unknown, entita: EntitaDiProvider[]): Map<string, number>;
}

/**
 * eWeLink, dall'integrazione SonoffLAN.
 *
 * Una presa a un canale dice `pulse: "on"` e `pulseWidth` in millisecondi,
 * e la sua entità si chiama come il dispositivo. Una a più canali dice
 * `pulses: [{ outlet, pulse, width }]`, e l'entità del canale `n` si chiama
 * `<dispositivo>_<n + 1>`.
 */
export const EWELINK: LettoreImpulsi = {
  piattaforma: 'sonoff',
  leggi(diagnostica, entita) {
    const trovati = new Map<string, number>();
    const devices = (diagnostica as { devices?: Record<string, { params?: Record<string, unknown> }> } | undefined)
      ?.devices;
    if (!devices || typeof devices !== 'object') return trovati;

    const perNome = new Map(entita.map((one) => [one.uniqueId, one.entityId]));
    const segna = (uniqueId: string, attivo: unknown, durata: unknown): void => {
      const entityId = perNome.get(uniqueId);
      const ms = Number(durata);
      if (entityId && attivo === 'on' && Number.isFinite(ms) && ms > 0) trovati.set(entityId, ms);
    };

    for (const [deviceId, device] of Object.entries(devices)) {
      const params = device?.params;
      if (!params) continue;
      if (params.pulse !== undefined) segna(deviceId, params.pulse, params.pulseWidth);
      if (Array.isArray(params.pulses)) {
        for (const canale of params.pulses as { outlet?: unknown; pulse?: unknown; width?: unknown }[]) {
          const outlet = Number(canale.outlet);
          if (Number.isInteger(outlet)) segna(`${deviceId}_${outlet + 1}`, canale.pulse, canale.width);
        }
      }
    }
    return trovati;
  },
};

/** I domini delle entità che hanno un interruttore, l'unica cosa che può essere a impulso. */
const ACCENDIBILI = new Set(['switch', 'light', 'fan', 'input_boolean']);


/**
 * Tutti gli interruttori a impulso della casa, da tutti i provider.
 *
 * Una lettura che non riesce — l'integrazione non c'è, la diagnostica
 * risponde male — non ferma le altre e non ferma l'agente: quei dispositivi
 * restano interruttori normali, com'erano prima.
 */
export async function leggiImpulsi(ha: HomeAssistant, lettori: LettoreImpulsi[]): Promise<Map<string, number>> {
  const tutti = new Map<string, number>();
  for (const lettore of lettori) {
    try {
      /*
       * Solo quelle che si accendono e si spengono. Un'integrazione dà lo
       * stesso nome interno a più entità dello stesso canale — Mansarda ha
       * `10025415b6_1` sia sull'interruttore sia sul selettore dello stato
       * all'accensione — e l'impulso finiva sul selettore, dove non si vede.
       */
      const entita = (await ha.entitiesOf(lettore.piattaforma)).filter((one) =>
        ACCENDIBILI.has(one.entityId.split('.')[0] ?? ''),
      );
      const collegamenti = [...new Set(entita.map((one) => one.entryId).filter((id): id is string => !!id))];
      for (const entryId of collegamenti) {
        const suoi = entita.filter((one) => one.entryId === entryId);
        for (const [entityId, ms] of lettore.leggi(await ha.diagnostics(entryId), suoi)) tutti.set(entityId, ms);
      }
    } catch (error) {
      console.warn(`impulsi da ${lettore.piattaforma}: ${(error as Error).message}`);
    }
  }
  return tutti;
}
