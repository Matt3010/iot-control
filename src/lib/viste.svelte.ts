import type { Agent, Device, Scene } from './devices.svelte';
import { store } from './store.svelte';
import type { Category, Group, PlaceMap } from './types';
import { perNome, poiPerNome, Vista } from './vista.svelte';

/**
 * Le viste degli elenchi dell'app, una per ogni genere di cosa.
 *
 * Una per genere e non una per schermata: i dispositivi stanno dentro alla
 * scheda di ogni agente e nella sua pagina, e messi in fila per stato in un
 * posto devono esserlo anche nell'altro. Qui ci sono i criteri che hanno
 * senso per ognuno; come si mostrano lo decide chi li usa.
 *
 * Le viste che servono a una schermata sola — le regole degli avvisi, che
 * sono righe fatte apposta per quella tabella — stanno nella schermata.
 */

/** Chi risponde prima: è quello che si guarda aprendo la pagina. */
const perStato = <T extends { name: string; online: boolean }>(
  a: T,
  b: T,
): number => Number(b.online) - Number(a.online);

export const vistaDispositivi = new Vista<Device>({
  chiave: 'dispositivi',
  criteri: [
    { id: 'nome', label: 'Nome', per: perNome },
    { id: 'stato', label: 'Stato', per: poiPerNome(perStato) },
  ],
});

export const vistaAgenti = new Vista<Agent>({
  chiave: 'agenti',
  criteri: [
    { id: 'nome', label: 'Nome', per: perNome },
    { id: 'stato', label: 'Stato', per: poiPerNome(perStato) },
    // i più popolati prima: sono le case, gli altri di solito sono prove
    {
      id: 'dispositivi',
      label: 'Dispositivi',
      per: poiPerNome((a, b) => a.devices - b.devices),
      verso: 'desc',
    },
  ],
});

export const vistaScene = new Vista<Scene>({
  chiave: 'scene',
  criteri: [
    { id: 'nome', label: 'Nome', per: perNome },
    {
      id: 'passi',
      label: 'Cose che muove',
      per: poiPerNome((a, b) => a.steps.length - b.steps.length),
      verso: 'desc',
    },
  ],
});

/** Quanti luoghi, in tutto l'indice: il conto che si legge accanto al nome. */
const luoghiDi = (mapId: string): number =>
  store.places.filter((place) => place.mapId === mapId).length;

export const vistaMappe = new Vista<PlaceMap>({
  chiave: 'mappe',
  criteri: [
    { id: 'nome', label: 'Nome', per: perNome },
    {
      id: 'luoghi',
      label: 'Luoghi',
      per: poiPerNome((a, b) => luoghiDi(a.id) - luoghiDi(b.id)),
      verso: 'desc',
    },
  ],
});

export const vistaCategorie = new Vista<Category>({
  chiave: 'categorie',
  // oltre una decina si cercano invece di scorrerle
  testoDi: (categoria) => categoria.name,
  criteri: [
    { id: 'nome', label: 'Nome', per: perNome },
    {
      id: 'luoghi',
      label: 'Luoghi',
      per: poiPerNome((a, b) => store.countIn(a.id) - store.countIn(b.id)),
      verso: 'desc',
    },
  ],
});

export const vistaGruppi = new Vista<Group>({
  chiave: 'gruppi',
  testoDi: (gruppo) => gruppo.name,
  criteri: [
    { id: 'nome', label: 'Nome', per: perNome },
    {
      id: 'luoghi',
      label: 'Luoghi',
      per: poiPerNome(
        (a, b) => store.countGroup(a.id) - store.countGroup(b.id),
      ),
      verso: 'desc',
    },
  ],
});
