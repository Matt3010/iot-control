// Category system — each restaurant becomes a space structure on the colony.
// `building` is a Kenney Space Kit model, `prop` a small object beside it,
// `color` the theme colour used for the pad, label dot and detail card.
export const CATEGORIES = {
  pizza:    { label: 'Pizza',       color: '#ffa034', building: 'hangar_roundA',      prop: 'satelliteDish' },
  japanese: { label: 'Giapponese',  color: '#5fd0e6', building: 'hangar_smallA',      prop: 'rover' },
  fine:     { label: 'Fine Dining', color: '#ffd24a', building: 'hangar_largeA',      prop: 'satelliteDish_large' },
  burger:   { label: 'Burger',      color: '#ff7a3c', building: 'hangar_roundB',      prop: 'barrels' },
  seafood:  { label: 'Pesce',       color: '#46c0e8', building: 'hangar_smallB',      prop: 'craft_speederA' },
  cafe:     { label: 'Caffè',       color: '#d59a5a', building: 'structure_detailed', prop: 'barrel' },
  trattoria:{ label: 'Trattoria',   color: '#9ad24a', building: 'hangar_largeB',      prop: 'turret_single' },
  dessert:  { label: 'Dolci',       color: '#ef8fb8', building: 'structure',          prop: 'craft_racer' },
};

// Demo restaurants — a colony of Italian outposts among the stars.
export const DEMO_RESTAURANTS = [
  { name: "L'Antica da Michele", category: 'pizza',    city: 'Napoli',  rating: 4.6, price: '€',    notes: 'La margherita di riferimento, da oltre un secolo.' },
  { name: 'Sushisen',            category: 'japanese', city: 'Milano',  rating: 4.4, price: '€€€',  notes: 'Omakase intimo, pesce che arriva ogni mattina.' },
  { name: 'Le Calandre',         category: 'fine',     city: 'Rubano',  rating: 4.9, price: '€€€€', notes: '3 stelle Michelin. Il regno degli Alajmo.' },
  { name: 'Burgez',              category: 'burger',   city: 'Milano',  rating: 4.1, price: '€€',   notes: 'Smash burger senza fronzoli, aperto fino a tardi.' },
  { name: 'Il Pescatore',        category: 'seafood',  city: 'Canneto', rating: 4.7, price: '€€€€', notes: 'Tempio del pesce, tre generazioni.' },
  { name: 'Bar Luce',            category: 'cafe',     city: 'Milano',  rating: 4.3, price: '€',    notes: 'Caffè wesandersoniano dentro la Fondazione Prada.' },
  { name: 'Da Nennella',         category: 'trattoria',city: 'Napoli',  rating: 4.5, price: '€',    notes: 'Chiassosa, generosa, autentica. Porta contanti.' },
  { name: 'Gelateria dei Neri',  category: 'dessert',  city: 'Firenze', rating: 4.8, price: '€',    notes: 'Ricotta e fichi che vale il viaggio.' },
];

let seq = 1;
export function makeId() { return 'r' + seq++; }
