import type { Handler } from '../../shared/protocol.js';
import type { Extra } from './extras.js';
import { EWELINK, type LettoreImpulsi } from './impulsi.js';

/**
 * I provider che l'agente sa collegare, e cosa sa di ognuno.
 *
 * Stavano in tre elenchi — cosa installare, quali collegamenti mostrare,
 * chi sa dire se una presa è a impulso — e un provider nuovo andava
 * ricordato in tutti e tre. Adesso è una voce qui, con dentro solo quello
 * che gli serve. Come si spiega a una persona lo sa il sito, nel suo
 * registro (src/lib/providers.ts): qui c'è come si installa e come si legge.
 */
export interface Provider {
  handler: Handler;
  /** Come lo chiamiamo nei messaggi di questa macchina. */
  label: string;
  /** Se Home Assistant non lo ha di serie: cosa installare, e da dove. */
  extra?: Extra;
  /** Se sa dire quali interruttori sono a impulso, e come. */
  impulsi?: LettoreImpulsi;
}

export const PROVIDERS: Record<Handler, Provider> = {
  tuya: { handler: 'tuya', label: 'Tuya' },
  sonoff: {
    handler: 'sonoff',
    label: 'eWeLink',
    // la versione è fissata, per la ragione scritta in extras.ts
    extra: {
      domain: 'sonoff',
      label: 'eWeLink',
      repo: 'AlexxIT/SonoffLAN',
      ref: 'v3.13.0',
      source: 'custom_components/sonoff',
    },
    impulsi: EWELINK,
  },
  // una telecamera: un collegamento per canale, e niente da installare
  generic: { handler: 'generic', label: 'Telecamera' },
};

/** Il provider con quel nome, o niente se non lo conosciamo. */
export const providerDi = (handler: string | undefined): Provider | undefined =>
  handler && handler in PROVIDERS ? PROVIDERS[handler as Handler] : undefined;

/** Tutti i lettori di impulsi, dai provider che ne hanno uno. */
export const lettoriImpulsi = (): LettoreImpulsi[] =>
  Object.values(PROVIDERS).flatMap((provider) => (provider.impulsi ? [provider.impulsi] : []));
