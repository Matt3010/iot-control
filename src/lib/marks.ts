import {
  Anchor,
  Baby,
  Banknote,
  Beer,
  Bike,
  Bed,
  Briefcase,
  Building2,
  Bus,
  Camera,
  Car,
  Church,
  Clapperboard,
  Coffee,
  Cross,
  Dog,
  Dumbbell,
  Factory,
  Film,
  Flower2,
  Fuel,
  GraduationCap,
  Hammer,
  Handshake,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Leaf,
  Library,
  MapPin,
  Mountain,
  Music,
  Package,
  Palette,
  ParkingSquare,
  PawPrint,
  Pizza,
  Plane,
  Scissors,
  Ship,
  ShoppingBag,
  ShoppingCart,
  Sprout,
  Stethoscope,
  Store,
  Sun,
  Trees,
  TramFront,
  Trophy,
  Utensils,
  Waves,
  Wine,
  Wrench,
  createElement,
} from 'lucide';
import type { IconNode } from 'lucide';

/**
 * I segni delle categorie.
 *
 * Al posto delle emoji, che sembrano una scelta comoda e non lo sono: ognuno
 * le vede disegnate dal proprio sistema — la stessa moto è rossa e sportiva
 * su un telefono e azzurra e tonda su un altro — si portano dietro colori
 * loro che litigano con quello della categoria, e a quattordici pixel dentro
 * un pin molte non si distinguono. Una mappa che si condivide dovrebbe
 * apparire uguale a chi la guarda.
 *
 * Queste sono disegni a tratto: prendono il colore della categoria invece di
 * combatterlo, restano nitide a qualsiasi misura, e sono le stesse per tutti.
 *
 * Sono una quarantina scelte a mano, non un catalogo: un elenco di mille voci
 * non si sfoglia, si subisce. Il nome in italiano è quello con cui si cerca —
 * chi cerca «mangiare» deve trovare il coltello e la forchetta.
 */
export interface Mark {
  /** Quello che finisce nei dati, e non cambia più. */
  key: string;
  /** Come si chiama, e come si cerca. */
  label: string;
  /** E le altre parole con cui qualcuno la cercherebbe. */
  also?: string;
  icon: IconNode;
}

export const MARKS: readonly Mark[] = [
  { key: 'pin', label: 'Luogo', also: 'segno generico punto', icon: MapPin },
  { key: 'home', label: 'Casa', also: 'abitazione appartamento', icon: Home },
  { key: 'work', label: 'Lavoro', also: 'ufficio sede', icon: Briefcase },
  { key: 'office', label: 'Ufficio', also: 'palazzo azienda', icon: Building2 },
  { key: 'remote', label: 'Postazione', also: 'computer coworking studio', icon: Laptop },
  { key: 'restaurant', label: 'Ristorante', also: 'mangiare trattoria osteria cena', icon: Utensils },
  { key: 'pizza', label: 'Pizzeria', also: 'pizza mangiare', icon: Pizza },
  { key: 'cafe', label: 'Caffè', also: 'bar colazione cappuccino', icon: Coffee },
  { key: 'bar', label: 'Bar', also: 'aperitivo cocktail sera', icon: Wine },
  { key: 'pub', label: 'Birreria', also: 'pub birra', icon: Beer },
  { key: 'hotel', label: 'Hotel', also: 'albergo dormire bnb', icon: Bed },
  { key: 'shop', label: 'Negozio', also: 'compere acquisti', icon: ShoppingBag },
  { key: 'market', label: 'Supermercato', also: 'spesa alimentari', icon: ShoppingCart },
  { key: 'store', label: 'Bottega', also: 'negozio artigiano', icon: Store },
  { key: 'bank', label: 'Banca', also: 'sportello posta', icon: Landmark },
  { key: 'money', label: 'Soldi', also: 'contanti bancomat pagamenti', icon: Banknote },
  { key: 'gym', label: 'Palestra', also: 'sport allenamento', icon: Dumbbell },
  { key: 'sport', label: 'Sport', also: 'campo squadra gara stadio', icon: Trophy },
  { key: 'bike', label: 'Bici', also: 'bicicletta ciclismo', icon: Bike },
  { key: 'car', label: 'Auto', also: 'macchina noleggio', icon: Car },
  { key: 'parking', label: 'Parcheggio', also: 'sosta posto auto', icon: ParkingSquare },
  { key: 'fuel', label: 'Benzina', also: 'carburante distributore colonnina', icon: Fuel },
  { key: 'garage', label: 'Officina', also: 'meccanico riparazioni', icon: Wrench },
  { key: 'works', label: 'Cantiere', also: 'lavori ristrutturazione', icon: Hammer },
  { key: 'factory', label: 'Capannone', also: 'fabbrica industria magazzino', icon: Factory },
  { key: 'warehouse', label: 'Magazzino', also: 'deposito scatole logistica', icon: Package },
  { key: 'train', label: 'Treno', also: 'stazione tram metro', icon: TramFront },
  { key: 'bus', label: 'Autobus', also: 'corriera fermata', icon: Bus },
  { key: 'plane', label: 'Aeroporto', also: 'aereo volo', icon: Plane },
  { key: 'boat', label: 'Barca', also: 'porto traghetto nave', icon: Ship },
  { key: 'harbour', label: 'Ormeggio', also: 'ancora molo darsena', icon: Anchor },
  { key: 'sea', label: 'Mare', also: 'spiaggia onde bagno', icon: Waves },
  { key: 'mountain', label: 'Montagna', also: 'cima rifugio neve', icon: Mountain },
  { key: 'park', label: 'Parco', also: 'verde alberi giardino pubblico', icon: Trees },
  { key: 'garden', label: 'Giardino', also: 'orto piante fiori', icon: Flower2 },
  { key: 'farm', label: 'Campagna', also: 'agricoltura campi azienda agricola', icon: Sprout },
  { key: 'nature', label: 'Natura', also: 'bosco sentiero foglia', icon: Leaf },
  { key: 'sun', label: 'Vacanza', also: 'sole ferie estate', icon: Sun },
  { key: 'hospital', label: 'Ospedale', also: 'pronto soccorso clinica', icon: HeartPulse },
  { key: 'doctor', label: 'Medico', also: 'dottore studio visita', icon: Stethoscope },
  { key: 'pharmacy', label: 'Farmacia', also: 'medicine croce verde', icon: Cross },
  { key: 'school', label: 'Scuola', also: 'università asilo corso', icon: GraduationCap },
  { key: 'library', label: 'Biblioteca', also: 'libri studio', icon: Library },
  { key: 'museum', label: 'Museo', also: 'mostra arte pinacoteca', icon: Palette },
  { key: 'cinema', label: 'Cinema', also: 'film sala', icon: Clapperboard },
  { key: 'theatre', label: 'Teatro', also: 'spettacolo palco', icon: Film },
  { key: 'music', label: 'Musica', also: 'concerto locale live', icon: Music },
  { key: 'church', label: 'Chiesa', also: 'parrocchia duomo cappella', icon: Church },
  { key: 'family', label: 'Famiglia', also: 'bambini nido genitori', icon: Baby },
  { key: 'friends', label: 'Amici', also: 'persone incontro ritrovo', icon: Handshake },
  { key: 'pet', label: 'Animali', also: 'cane gatto veterinario', icon: PawPrint },
  { key: 'dog', label: 'Cane', also: 'passeggiata area cani', icon: Dog },
  { key: 'beauty', label: 'Parrucchiere', also: 'estetista barbiere forbici', icon: Scissors },
  { key: 'camera', label: 'Telecamera', also: 'videocamera sorveglianza foto', icon: Camera },
] as const;

const BY_KEY = new Map(MARKS.map((mark) => [mark.key, mark]));

/**
 * Il segno di una categoria, qualunque cosa ci sia scritto dentro.
 *
 * Nel campo ci può stare la chiave di un disegno — «restaurant» — oppure
 * un'emoji, che è quello che ci finiva prima. Le categorie di ieri non si
 * toccano: restano come sono finché qualcuno non le cambia, e cambiare idea
 * su come disegnare un segno non deve riscrivere i dati di nessuno.
 */
export const markOf = (value: string | undefined): Mark | undefined =>
  value ? BY_KEY.get(value) : undefined;

/** Quelli che rispondono a quello che si sta scrivendo. */
export function marksLike(query: string): readonly Mark[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return MARKS;

  return MARKS.filter(
    (mark) =>
      mark.label.toLowerCase().includes(needle) ||
      mark.key.includes(needle) ||
      (mark.also ?? '').includes(needle),
  );
}

/** Il segno di chi non ne ha scelto uno. */
export const DEFAULT_MARK = 'pin';

/**
 * Quando quello che c'è scritto non è una chiave, esce così com'è — ed esce
 * dentro a del markup. Un'emoji è innocua, ma il campo lo scrive una persona
 * e una parentesi angolata lì dentro diventerebbe un pezzo di pagina.
 */
const plain = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Il disegno da mettere, qualunque cosa ci sia scritta nel campo.
 *
 * I casi sono tre. La chiave di un segno — «restaurant» — è quello normale.
 * Un'emoji è una categoria di prima, e si lascia la sua: chi non l'ha mai
 * toccata non deve vedersela cambiare sotto gli occhi.
 *
 * Il terzo è una parola che non è né l'una né l'altra — «tag», «star» —,
 * la chiave di un catalogo di ieri rimasta nei dati da quando i segni si
 * chiamavano in un altro modo. Nessuno la sa più disegnare, e finiva scritta
 * accanto al nome: si leggeva «tag Lavoro», e chi guardava cercava fra le
 * sue categorie una che si chiamasse così. Di quelle si disegna il
 * segnaposto, che è quello che si mette quando non si sa.
 *
 * Riconoscerle è semplice, perché un'emoji sta fuori dall'alfabeto latino e
 * una parola scritta da noi ci sta dentro.
 */
export function drawFor(value: string | undefined): Mark | undefined {
  const mark = markOf(value);
  if (mark) return mark;
  if (value && /[^\u0000-\u007f]/.test(value)) return undefined;
  return markOf(DEFAULT_MARK);
}

/**
 * Il segno come pezzo di markup, per dove non c'è Svelte a disegnarlo — il
 * pin sulla mappa, che Leaflet costruisce da sé.
 */
export function signOf(value: string | undefined): string {
  const mark = drawFor(value);
  if (!mark) return plain(value ?? '');

  const svg = createElement(mark.icon);
  svg.setAttribute('class', 'ico');
  return svg.outerHTML;
}
