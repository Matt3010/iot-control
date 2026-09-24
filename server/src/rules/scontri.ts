import type { DeviceValue } from '../../../shared/protocol.js';
import type { Scene } from '../types.js';

/**
 * Due scene che possono partire insieme e dare ordini diversi alla stessa
 * cosa.
 *
 * Se «Sera» chiude la tenda e «Notte» la apre, e tutte e due partono alle
 * 22, la tenda fa quello che dice l'ultima che arriva, e l'ordine in cui
 * arrivano non lo decide nessuno. Invece di scoprirlo guardando la tenda, si
 * rifiuta di salvarle così e si dice perché.
 *
 * Si guarda solo quello che si può sapere prima: lo stesso orario negli
 * stessi giorni, o lo stesso cambiamento dello stesso dispositivo. Un
 * dispositivo che cambia proprio nel minuto in cui parte una scena a orario
 * non si può prevedere, e lì vince l'ultima.
 */

const TUTTI = [0, 1, 2, 3, 4, 5, 6];

/** In quali giorni della settimana può partire a orario, contando le condizioni sui giorni. */
function giorni(scene: Scene): number[] {
  const when = scene.when;
  if (!when || when.off) return [];
  let quali = when.days.length ? when.days : TUTTI;
  for (const condizione of scene.only ?? []) {
    if (condizione.kind === 'days' && condizione.days.length) quali = quali.filter((day) => condizione.days.includes(day));
  }
  return quali;
}

/** Il giorno della settimana di una data scritta come un calendario. */
const giornoDi = (data: string): number => new Date(`${data}T12:00:00Z`).getUTCDay();

/** Se possono partire nello stesso momento. */
export function partonoInsieme(a: Scene, b: Scene): boolean {
  // lo stesso orario
  if (a.when && b.when && !a.when.off && !b.when.off && a.when.at === b.when.at) {
    if (a.when.on && b.when.on) {
      if (a.when.on === b.when.on) return true;
    } else if (a.when.on) {
      if (giorni(b).includes(giornoDi(a.when.on))) return true;
    } else if (b.when.on) {
      if (giorni(a).includes(giornoDi(b.when.on))) return true;
    } else if (giorni(a).some((day) => giorni(b).includes(day))) {
      return true;
    }
  }

  // lo stesso cambiamento dello stesso dispositivo: «sopra 25» e «sopra 28»
  // partono insieme quando la temperatura salta da 24 a 30
  return (a.triggers ?? []).some((ta) =>
    (b.triggers ?? []).some(
      (tb) =>
        ta.deviceId === tb.deviceId &&
        ta.code === tb.code &&
        ta.op === tb.op &&
        (ta.op !== 'is' || String(ta.value) === String(tb.value)),
    ),
  );
}

/** Cosa ordina una scena, cosa per cosa: l'ultimo valore scritto per ognuna. */
function ordini(scene: Scene): Map<string, DeviceValue> {
  const out = new Map<string, DeviceValue>();
  for (const step of scene.steps) {
    if (step.deviceId && step.code && step.value !== undefined) out.set(`${step.deviceId}:${step.code}`, step.value);
  }
  return out;
}

/** Le cose a cui le due scene danno ordini diversi. */
export function ordiniDiversi(a: Scene, b: Scene): { deviceId: string; code: string }[] {
  const suoi = ordini(b);
  const out: { deviceId: string; code: string }[] = [];
  for (const [chiave, valore] of ordini(a)) {
    if (!suoi.has(chiave) || String(suoi.get(chiave)) === String(valore)) continue;
    const [deviceId, code] = chiave.split(/:(.*)/s) as [string, string];
    out.push({ deviceId, code });
  }
  return out;
}
