import type { Scene, SceneStep } from '../types.js';

/**
 * Una scena con dentro le scene che chiama, stesa in una fila sola.
 *
 * «Buonanotte» chiama «Chiudi tutto» e ci aggiunge due cose sue. Chi deve
 * sapere cosa fa Buonanotte — chi la fa partire, chi cerca i giri, chi
 * controlla che non litighi con un'altra scena — deve guardare anche dentro
 * a Chiudi tutto, e con i tempi giusti: una riga dopo un'attesa di dieci
 * minuti non parte insieme alle altre. Prima lo facevano tre pezzi diversi
 * ognuno a modo suo, con tre protezioni diverse dagli anelli. Adesso è una
 * funzione sola, e l'anello lo ferma lei.
 */

/** Una riga che fa davvero qualcosa, con il suo momento. */
export interface Foglia {
  step: SceneStep;
  /** I secondi dall'inizio della scena premuta: le righe con lo stesso `t` partono insieme. */
  t: number;
  /** La scena in cui è scritta, che può essere una chiamata. */
  da: Scene;
}

export interface Stesa {
  foglie: Foglia[];
  /** Tutte le scene toccate, quella di partenza compresa. */
  scene: Set<string>;
  /**
   * Gli anelli trovati, ognuno dalla scena a cui si torna fino a lei di
   * nuovo. Le righe di un anello non si stendono due volte: la chiamata
   * che riporta indietro si salta.
   */
  anelli: string[][];
  /** Se è stata tagliata perché troppo lunga: allora non dice tutto, e non la si salva. */
  tagliata: boolean;
}

/**
 * Oltre questo numero di righe una scena non si stende più. Una scena ne ha
 * al massimo quaranta, ma due che si chiamano a vicenda senza fare un anello
 * — A chiama B due volte, B chiama C due volte — si moltiplicano.
 */
const TROPPE = 2_000;

/**
 * Stende una scena. `trova` dà una scena dal suo id, com'è adesso o come
 * sarebbe dopo una modifica: chi scrive vuole sapere cosa succederebbe
 * prima di salvare.
 */
export function stendi(scene: Scene, trova: (id: string) => Scene | undefined): Stesa {
  const foglie: Foglia[] = [];
  const toccate = new Set<string>();
  const anelli: string[][] = [];
  let tagliata = false;

  const giu = (qui: Scene, da: number, strada: string[]): void => {
    toccate.add(qui.id);
    let t = da;
    for (const step of qui.steps) {
      if (foglie.length > TROPPE) {
        tagliata = true;
        return;
      }
      t += Math.max(0, step.after ?? 0);
      if (step.scene) {
        // una scena che è già sulla strada riporterebbe qui, e girerebbe per sempre
        if (strada.includes(step.scene)) {
          anelli.push([...strada.slice(strada.indexOf(step.scene)), step.scene]);
          continue;
        }
        const chiamata = trova(step.scene);
        if (chiamata) giu(chiamata, t, [...strada, chiamata.id]);
        continue;
      }
      foglie.push({ step, t, da: qui });
    }
  };

  giu(scene, 0, [scene.id]);
  return { foglie, scene: toccate, anelli, tagliata };
}

/** I comandi a un dispositivo, con il loro momento: quello che serve a giri e scontri. */
export function comandi(stesa: Stesa): { deviceId: string; code: string; value: NonNullable<SceneStep['value']>; t: number }[] {
  return stesa.foglie.flatMap(({ step, t }) =>
    step.deviceId && step.code && step.value !== undefined
      ? [{ deviceId: step.deviceId, code: step.code, value: step.value, t }]
      : [],
  );
}

/**
 * Le righe di una scena senza quelle che `via` sceglie, con i tempi giusti.
 *
 * L'attesa sta scritta sulla riga che aspetta, e i tempi si sommano riga per
 * riga: in «apri la tenda, dopo dieci minuti spegni X, chiudi la tenda»
 * togliere X con la sua attesa faceva partire apri e chiudi insieme, che è
 * proprio quello che `SceneManager.#clean` non lascia salvare. L'attesa di
 * una riga tolta passa alla riga dopo, sommata alla sua; in fondo non
 * aspetta più niente e se ne va.
 */
export function senzaRighe(steps: SceneStep[], via: (step: SceneStep) => boolean): SceneStep[] {
  const out: SceneStep[] = [];
  let resta = 0;
  for (const step of steps) {
    const after = Math.max(0, step.after ?? 0);
    if (via(step)) {
      resta += after;
      continue;
    }
    const tutta = after + resta;
    resta = 0;
    const riga: SceneStep = { ...step };
    delete riga.after;
    out.push(tutta ? { ...riga, after: tutta } : riga);
  }
  return out;
}
