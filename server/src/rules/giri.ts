import type { Capability } from '../../../shared/protocol.js';
import { comandi, stendi } from './chiamate.js';
import type { Device, Scene, SceneTrigger } from '../types.js';

/**
 * Scene che si farebbero ripartire da sole.
 *
 * «Quando Mansarda scatta, premi Mansarda» riparte a ogni suo comando, e lo
 * stesso fanno due scene dove ognuna comanda quello che fa partire l'altra.
 * Invece di fermare il giro mentre gira, lo si rifiuta quando si scrive, e
 * si dice da dove passa.
 *
 * Conta se un comando può davvero far scattare una partenza, non solo se
 * tocca lo stesso dispositivo. «Quando la luce si accende, dopo dieci minuti
 * spegnila» non è un giro, perché spegnere non fa scattare «si accende».
 * Quello che dai dati non si vede — una presa che accende un sensore di
 * movimento — lo ferma a parte il fusibile in `services/SceneTriggers.ts`.
 */

type Comando = ReturnType<typeof comandi>[number];

/** Un passo del giro: da quale scena, attraverso quale dispositivo, a quale. */
export interface Passo {
  da: string;
  deviceId: string;
  a: string;
}

/** Se quel comando può far scattare quella partenza. */
function faScattare(comando: Comando, trigger: SceneTrigger, capability: Capability | undefined, delComando: Capability | undefined): boolean {
  if (comando.deviceId !== trigger.deviceId) return false;

  if (comando.code !== trigger.code) {
    /*
     * Una luminosità o un colore accendono anche l'interruttore: lo dice
     * l'agente con `accende`, che nomina proprio quell'interruttore (per un
     * accessorio, quello della sua entità). Un cursore accende sopra zero,
     * un colore sempre.
     */
    if (!delComando || !('accende' in delComando) || delComando.accende !== trigger.code) return false;
    if (String(trigger.value) !== 'true') return false;
    return delComando.kind === 'color' || Number(comando.value) > 0;
  }

  // a impulso ogni pressione scatta, qualunque cosa si scriva
  if (capability?.kind === 'switch' && capability.pulse) return true;

  if (trigger.op === 'above') return Number(comando.value) > Number(trigger.value);
  if (trigger.op === 'below') return Number(comando.value) < Number(trigger.value);
  return String(comando.value) === String(trigger.value);
}

/** Chi fa partire chi, e attraverso quale dispositivo. */
function archi(scenes: Scene[], devices: Device[]): Passo[] {
  const perId = new Map(scenes.map((one) => [one.id, one]));
  const trova = (id: string) => perId.get(id);
  const perDispositivo = new Map(devices.map((one) => [one.id, one]));
  const capacita = (deviceId: string, code: string): Capability | undefined =>
    perDispositivo.get(deviceId)?.capabilities.find((one) => one.code === code);

  const out: Passo[] = [];
  for (const da of scenes) {
    const suoi = comandi(stendi(da, trova));
    for (const a of scenes) {
      for (const trigger of a.triggers ?? []) {
        const colpo = suoi.find((comando) =>
          faScattare(comando, trigger, capacita(trigger.deviceId, trigger.code), capacita(comando.deviceId, comando.code)),
        );
        if (colpo) {
          out.push({ da: da.id, deviceId: colpo.deviceId, a: a.id });
          break;
        }
      }
    }
  }
  return out;
}

/** Un giro che parte e torna a quella scena, se c'è. */
function giroDa(inizio: string, passi: Passo[]): Passo[] | null {
  const pila: { qui: string; strada: Passo[] }[] = [{ qui: inizio, strada: [] }];
  const visti = new Set<string>();
  while (pila.length) {
    const { qui, strada } = pila.pop() as { qui: string; strada: Passo[] };
    for (const passo of passi.filter((one) => one.da === qui)) {
      if (passo.a === inizio) return [...strada, passo];
      if (visti.has(passo.a)) continue;
      visti.add(passo.a);
      pila.push({ qui: passo.a, strada: [...strada, passo] });
    }
  }
  return null;
}

/**
 * Il giro che una modifica farebbe nascere, o `null`.
 *
 * Conta un giro che passa dalla scena modificata, o uno nuovo altrove — una
 * scena chiamata da un'altra che adesso comanda quello che fa partire
 * quell'altra. Un giro che c'era già e che non la tocca non blocca chi sta
 * scrivendo un'altra cosa.
 */
export function giroNuovo(prima: Scene[], dopo: Scene[], devices: Device[], id: string): Passo[] | null {
  const passiDopo = archi(dopo, devices);

  const suo = giroDa(id, passiDopo);
  if (suo) return suo;

  /*
   * Gli archi di prima servono solo se dopo c'è un giro che non passa da
   * lei, per sapere se c'era già: quasi mai. Si calcolano allora, e una
   * volta sola, invece che a ogni modifica.
   */
  let passiPrima: Passo[] | undefined;
  for (const scene of dopo) {
    const adesso = giroDa(scene.id, passiDopo);
    if (!adesso) continue;
    passiPrima ??= archi(prima, devices);
    if (!giroDa(scene.id, passiPrima)) return adesso;
  }
  return null;
}
