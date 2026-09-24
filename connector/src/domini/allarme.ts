import type { DeviceValue } from '../../../shared/protocol.js';
import type { HaEntity } from '../homeassistant.js';
import { adesso, fra, has, metti, ordina, ordini, tasti, type Ordine } from './comune.js';
import type { Dominio } from './tipo.js';

/**
 * Un allarme: le voci sono gli ordini, e quella accesa è com'è adesso. Un
 * ordine che vuole il codice non si offre, perché il protocollo non ha un
 * modo di chiederlo a chi preme.
 */

const ALARM = { ARM_HOME: 1, ARM_AWAY: 2, ARM_NIGHT: 4, ARM_VACATION: 32 } as const;

/** `bit` 0 è disattivare: lo sanno fare tutti, ma vuole il codice più spesso degli altri. */
const ORDINI: (Ordine & { bit: number })[] = [
  { stato: 'disarmed', voce: 'Disattiva', servizio: 'alarm_disarm', bit: 0 },
  { stato: 'armed_home', voce: 'Attiva in casa', servizio: 'alarm_arm_home', bit: ALARM.ARM_HOME },
  { stato: 'armed_away', voce: 'Attiva fuori casa', servizio: 'alarm_arm_away', bit: ALARM.ARM_AWAY },
  { stato: 'armed_night', voce: 'Attiva di notte', servizio: 'alarm_arm_night', bit: ALARM.ARM_NIGHT },
  { stato: 'armed_vacation', voce: 'Attiva per le vacanze', servizio: 'alarm_arm_vacation', bit: ALARM.ARM_VACATION },
];

/** Gli stati che la centrale conosce per un allarme; come si leggono lo dice lei (`vociDi`). */
const STATI = [
  'disarmed',
  'armed_home',
  'armed_away',
  'armed_night',
  'armed_vacation',
  'armed_custom_bypass',
  'arming',
  'disarming',
  'pending',
  'triggered',
];

/** Quali ordini a un allarme si possono dare senza codice. */
function senzaCodice(entity: HaEntity) {
  const conCodice = entity.attributes.code_format !== null && entity.attributes.code_format !== undefined;
  const armaSenza = !conCodice || entity.attributes.code_arm_required === false;
  return ordini(entity, ORDINI, (one) => (one.bit === 0 ? !conCodice : armaSenza && has(entity, one.bit)));
}

export const allarme: Dominio = {
  ruolo: 'principale',
  capacita(ctx) {
    return [...tasti('alarm', 'Allarme', senzaCodice(ctx.entity).voci), adesso(ctx, STATI)];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'status', fra(entity.state, STATI));
    // com'è adesso detto con la voce di un ordine, solo se è un ordine che qui si può dare
    metti(state, 'alarm', senzaCodice(entity).voceDi(entity.state));
    return state;
  },
  comandi: { alarm: ordina('alarm_control_panel', ORDINI) },
};
