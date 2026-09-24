import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { accendi, acceso, accesoSe, attr, elenco, fra, has, metti, numeric, scelta, servizio } from './comune.js';
import type { Dominio, Ruolo } from './tipo.js';

/**
 * Le cose che fanno una cosa sola: una levetta, un tasto, un numero, un
 * elenco, un aggiornamento, un telecomando. Molte esistono due volte — una
 * della marca (`switch`, `number`) e una creata da chi usa la centrale
 * (`input_boolean`, `input_number`) — e sono la stessa cosa con un altro
 * nome: qui si scrivono una volta e si danno ai due domini.
 */

/** Una levetta e basta. */
const interruttore = (ruolo: Ruolo, impostazione: boolean): Dominio => ({
  ruolo,
  impostazione,
  accendibile: true,
  capacita: () => [acceso],
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'power', accesoSe(entity.state));
    return state;
  },
  comandi: { power: accendi },
});

/** Un tasto che si preme e basta: un pulsante, una scena della marca. Non ha uno stato da dire. */
const tasto = (ruolo: Ruolo, impostazione: boolean, capacita: Capability, domain: string, service: string): Dominio => ({
  ruolo,
  impostazione,
  capacita: () => [capacita],
  stato: () => ({}),
  comandi: { [capacita.code]: servizio(domain, service) },
});

const premi = (domain: string, ruolo: Ruolo, impostazione: boolean): Dominio =>
  tasto(ruolo, impostazione, { code: 'press', kind: 'enum', label: 'Pulsante', values: ['Premi'], order: true }, domain, 'press');

/** Un numero che si comanda; da impostazione è lo stesso, con un nome suo (gruppi.ts). */
const numero = (domain: string, ruolo: Ruolo, impostazione: boolean): Dominio => ({
  ruolo,
  impostazione,
  capacita: ({ entity }) => [
    {
      code: 'value',
      kind: 'range',
      label: 'Valore',
      min: attr(entity, 'min', 0),
      max: attr(entity, 'max', 100),
      step: attr(entity, 'step', 1),
      ...(entity.attributes.unit_of_measurement ? { unit: String(entity.attributes.unit_of_measurement) } : {}),
    },
  ],
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'value', numeric(entity.state));
    return state;
  },
  comandi: { value: servizio(domain, 'set_value', (valore) => ({ value: Number(valore) })) },
});

/** Un elenco da cui si sceglie una voce. */
const elencoScelta = (domain: string, ruolo: Ruolo, impostazione: boolean): Dominio => ({
  ruolo,
  impostazione,
  capacita(ctx) {
    const voci = elenco(ctx.entity, 'options');
    return voci ? [scelta(ctx, 'value', 'Valore', voci)] : [];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'value', fra(entity.state, elenco(entity, 'options')));
    return state;
  },
  comandi: { value: servizio(domain, 'select_option', (valore) => ({ option: String(valore) })) },
});

export const switchDominio = interruttore('principale', true);
export const inputBoolean = interruttore('principale', false);
export const button = premi('button', 'comando', true);
export const inputButton = premi('input_button', 'principale', false);
export const scena = tasto('comando', false, { code: 'activate', kind: 'enum', label: 'Scena', values: ['Attiva'], order: true }, 'scene', 'turn_on');
export const number = numero('number', 'comando', true);
export const inputNumber = numero('input_number', 'principale', false);
export const select = elencoScelta('select', 'comando', true);
export const inputSelect = elencoScelta('input_select', 'principale', false);

const UPDATE_INSTALL = 1;

/** Un aggiornamento: che versione c'è, quale si potrebbe avere, e il tasto per averla. */
export const aggiornamento: Dominio = {
  ruolo: 'lettura',
  impostazione: true,
  capacita: ({ entity }) => [
    { code: 'installed', kind: 'sensor', label: 'Versione installata' },
    { code: 'latest', kind: 'sensor', label: 'Versione disponibile' },
    ...(has(entity, UPDATE_INSTALL) ? [{ code: 'press', kind: 'enum', label: 'Aggiornamento', values: ['Aggiorna'], order: true } as Capability] : []),
  ],
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    if (typeof entity.attributes.installed_version === 'string') state.installed = entity.attributes.installed_version;
    if (typeof entity.attributes.latest_version === 'string') state.latest = entity.attributes.latest_version;
    return state;
  },
  comandi: { press: servizio('update', 'install') },
};

const REMOTE_ACTIVITY = 4;

/** Un telecomando: si accende, e se sa fare delle attività si sceglie quale. */
export const telecomando: Dominio = {
  ruolo: 'comando',
  capacita({ entity }) {
    const attivita = elenco(entity, 'activity_list');
    return [
      acceso,
      ...(has(entity, REMOTE_ACTIVITY) && attivita ? [{ code: 'activity', kind: 'enum', label: 'Attività', values: attivita } as Capability] : []),
    ];
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'power', accesoSe(entity.state));
    metti(state, 'activity', fra(entity.attributes.current_activity, elenco(entity, 'activity_list')));
    return state;
  },
  comandi: {
    power: accendi,
    activity: servizio('remote', 'turn_on', (valore) => ({ activity: String(valore) })),
  },
};
