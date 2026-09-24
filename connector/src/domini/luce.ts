import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import { accendi, acceso, accesoSe, attr, elenco, fra, has, metti, numeric, percent, scelta } from './comune.js';
import type { Dominio } from './tipo.js';

/**
 * Una luce: accesa, quanto, di che bianco, di che colore, con che effetto.
 * Ognuna di queste solo se quella luce dice di saperla fare: una luce che
 * sa solo accendersi non ha un cursore da mostrare.
 */

const EFFETTI = 4;

/** I modi in cui una luce dice un colore, e non un bianco. */
const COLORI = ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'];

/** Una luce che sa solo accendersi non ha un cursore da mostrare. */
function dimmable(modi: unknown): boolean {
  return Array.isArray(modi) && modi.some((mode) => mode !== 'onoff' && mode !== 'unknown');
}

export const luce: Dominio = {
  ruolo: 'principale',
  accendibile: true,
  capacita(ctx) {
    const { entity } = ctx;
    const supportati = elenco(entity, 'supported_color_modes') ?? [];
    const out: Capability[] = [acceso];
    if (dimmable(entity.attributes.supported_color_modes)) out.push({ ...percent('Luminosità', 'brightness'), accende: 'power' } as Capability);
    // il bianco, da caldo a freddo, in kelvin: un cursore come un altro
    if (supportati.includes('color_temp')) {
      out.push({
        code: 'color_temp',
        kind: 'range',
        label: 'Bianco',
        min: attr(entity, 'min_color_temp_kelvin', 2000),
        max: attr(entity, 'max_color_temp_kelvin', 6500),
        step: 100,
        unit: 'K',
        // una luce spenta a cui si sceglie il bianco si accende
        accende: 'power',
      });
    }
    // il colore: una tinta sul cerchio, con il suo controllo
    if (supportati.some((modo) => COLORI.includes(modo))) out.push({ code: 'color', kind: 'color', label: 'Colore', accende: 'power' });
    // gli effetti che sa fare, come un elenco
    const effetti = elenco(entity, 'effect_list');
    if (has(entity, EFFETTI) && effetti) out.push(scelta(ctx, 'effect', 'Effetto', effetti, 'effect'));
    return out;
  },
  stato({ entity }) {
    const state: Record<string, DeviceValue> = {};
    metti(state, 'power', accesoSe(entity.state));
    // il bianco in kelvin, e il colore come tinta sul cerchio
    metti(state, 'color_temp', numeric(entity.attributes.color_temp_kelvin));
    const hs = entity.attributes.hs_color as [number, number] | undefined;
    if (Array.isArray(hs) && Number.isFinite(Number(hs[0]))) state.color = Math.round(Number(hs[0]));
    metti(state, 'effect', fra(entity.attributes.effect, elenco(entity, 'effect_list')));
    // la centrale tiene la luminosità su 255; fuori di qui si ragiona in percentuale
    const brightness = numeric(entity.attributes.brightness);
    if (brightness !== undefined) state.brightness = Math.round((Number(brightness) / 255) * 100);
    return state;
  },
  comandi: {
    power: accendi,
    brightness: (_ctx, valore) => ({ domain: 'light', service: 'turn_on', data: { brightness_pct: Number(valore) } }),
    color_temp: (_ctx, valore) => ({ domain: 'light', service: 'turn_on', data: { color_temp_kelvin: Number(valore) } }),
    // si cambia la tinta e basta: una luce pastello resta pastello
    color: ({ entity }, valore) => {
      const hs = entity?.attributes.hs_color as [number, number] | undefined;
      const inColore = COLORI.includes(String(entity?.attributes.color_mode ?? ''));
      const saturazione = inColore && Array.isArray(hs) && Number(hs[1]) > 0 ? Number(hs[1]) : 100;
      return { domain: 'light', service: 'turn_on', data: { hs_color: [Number(valore), saturazione] } };
    },
    effect: (_ctx, valore) => ({ domain: 'light', service: 'turn_on', data: { effect: String(valore) } }),
  },
};
