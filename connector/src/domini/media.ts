import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { accendi, acceso, elenco, fra, has, ignota, numeric, ordina, ordini, percent, servizio, metti, tasti, type Ordine } from './comune.js';
import type { Dominio } from './tipo.js';

/**
 * Una TV o una cassa, con i controlli che abbiamo già: una levetta per
 * accenderla, un cursore per il volume, le sorgenti come scelte, e i tasti
 * del lettore come ordini. Ognuno solo se quella TV dice di saperlo fare: un
 * tasto che non fa niente è peggio di nessun tasto.
 */

const MEDIA = {
  PAUSE: 1,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS: 16,
  NEXT: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  VOLUME_STEP: 1024,
  SELECT_SOURCE: 2048,
  STOP: 4096,
  PLAY: 16384,
  SELECT_SOUND_MODE: 65536,
} as const;

/** I tasti del lettore, e lo stato che «Play» e «Pausa» descrivono. */
const LETTORE: Ordine[] = [
  { voce: 'Indietro', servizio: 'media_previous_track', bit: MEDIA.PREVIOUS },
  { voce: 'Play', servizio: 'media_play', bit: MEDIA.PLAY, stato: 'playing' },
  { voce: 'Pausa', servizio: 'media_pause', bit: MEDIA.PAUSE, stato: 'paused' },
  { voce: 'Stop', servizio: 'media_stop', bit: MEDIA.STOP },
  { voce: 'Avanti', servizio: 'media_next_track', bit: MEDIA.NEXT },
];

/** Il volume a scatti, per chi non sa dire un numero. */
const SCATTI: Ordine[] = [
  { voce: 'Abbassa', servizio: 'volume_down' },
  { voce: 'Alza', servizio: 'volume_up' },
];

export const media: Dominio = {
  ruolo: 'principale',
  capacita({ entity }) {
    const out: Capability[] = [];
    if (has(entity, MEDIA.TURN_OFF) || has(entity, MEDIA.TURN_ON)) out.push(acceso);
    if (has(entity, MEDIA.VOLUME_SET)) out.push(percent('Volume', 'volume'));
    else if (has(entity, MEDIA.VOLUME_STEP)) out.push(...tasti('volume_step', 'Volume', ordini(entity, SCATTI).voci));
    if (has(entity, MEDIA.VOLUME_MUTE)) out.push({ code: 'mute', kind: 'switch', label: 'Muto' });
    const sorgenti = elenco(entity, 'source_list');
    if (has(entity, MEDIA.SELECT_SOURCE) && sorgenti) out.push({ code: 'source', kind: 'enum', label: 'Sorgente', values: sorgenti });
    const suoni = elenco(entity, 'sound_mode_list');
    if (has(entity, MEDIA.SELECT_SOUND_MODE) && suoni) out.push({ code: 'sound_mode', kind: 'enum', label: 'Audio', values: suoni });
    out.push(...tasti('playback', 'Riproduzione', ordini(entity, LETTORE).voci));
    return out;
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    // spenta o in attesa è spenta; accesa è tutto il resto, anche «ferma»
    if (!ignota(entity.state)) state.power = !['off', 'standby'].includes(entity.state);
    const volume = numeric(entity.attributes.volume_level);
    if (volume !== undefined) state.volume = Math.round(Number(volume) * 100);
    if (typeof entity.attributes.is_volume_muted === 'boolean') state.mute = entity.attributes.is_volume_muted;
    metti(state, 'source', fra(entity.attributes.source, elenco(entity, 'source_list')));
    metti(state, 'sound_mode', fra(entity.attributes.sound_mode, elenco(entity, 'sound_mode_list')));
    metti(state, 'playback', ordini(entity, LETTORE).voceDi(entity.state));
    return state;
  },
  comandi: {
    power: accendi,
    volume: servizio('media_player', 'volume_set', (valore) => ({ volume_level: Number(valore) / 100 })),
    volume_step: ordina('media_player', SCATTI),
    mute: servizio('media_player', 'volume_mute', (valore) => ({ is_volume_muted: Boolean(valore) })),
    source: servizio('media_player', 'select_source', (valore) => ({ source: String(valore) })),
    sound_mode: servizio('media_player', 'select_sound_mode', (valore) => ({ sound_mode: String(valore) })),
    playback: ordina('media_player', LETTORE),
  },
};
