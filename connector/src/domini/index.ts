import { allarme } from './allarme.js';
import { tenda, valvolaAcqua } from './apertura.js';
import { camera } from './camera.js';
import { clima } from './clima.js';
import { binario, evento, meteo, persona, sensore, tracker } from './letture.js';
import { luce } from './luce.js';
import { media } from './media.js';
import { aspirapolvere, tosaerba } from './pulizia.js';
import { scaldabagno } from './scaldabagno.js';
import {
  aggiornamento,
  button,
  inputBoolean,
  inputButton,
  inputNumber,
  inputSelect,
  number,
  scena,
  select,
  switchDominio,
  telecomando,
} from './semplici.js';
import { serratura } from './serratura.js';
import { sirena } from './sirena.js';
import type { Dominio } from './tipo.js';
import { umidificatore } from './umidificatore.js';
import { ventola } from './ventola.js';

/**
 * I domini della centrale che sono cose di casa, e chi li sa leggere. È
 * l'unica tabella: il ruolo nei dispositivi veri, le impostazioni, gli
 * interruttori che possono essere a impulso e gli eventi si ricavano da qui.
 * Il resto della centrale — automazioni, script, zone — non è un
 * dispositivo, e non c'è.
 *
 * Testi, date e orari da scrivere (`text`, `date`, `time`, `datetime`) non ci
 * sono: il protocollo non ha una forma per un campo libero.
 */
export const DOMINI: Record<string, Dominio> = {
  light: luce,
  switch: switchDominio,
  input_boolean: inputBoolean,
  input_number: inputNumber,
  input_select: inputSelect,
  input_button: inputButton,
  fan: ventola,
  cover: tenda,
  climate: clima,
  lock: serratura,
  camera,
  media_player: media,
  valve: valvolaAcqua,
  vacuum: aspirapolvere,
  lawn_mower: tosaerba,
  humidifier: umidificatore,
  water_heater: scaldabagno,
  siren: sirena,
  alarm_control_panel: allarme,
  person: persona,
  device_tracker: tracker,
  weather: meteo,
  button,
  scene: scena,
  number,
  select,
  remote: telecomando,
  sensor: sensore,
  binary_sensor: binario,
  event: evento,
  update: aggiornamento,
};
