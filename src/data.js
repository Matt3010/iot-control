// Category system: each category maps to a building model, a food "totem"
// model shown next to it, a label and a theme colour.
export const CATEGORIES = {
  pizza:    { label: 'Pizza',       color: '#e8562f', building: 'building-a', food: 'pizza' },
  japanese: { label: 'Giapponese',  color: '#4a5061', building: 'building-h', food: 'sushi-salmon' },
  fine:     { label: 'Fine Dining', color: '#c9a24b', building: 'building-e', food: 'wine-red' },
  burger:   { label: 'Burger',      color: '#c47a2c', building: 'building-c', food: 'burger' },
  seafood:  { label: 'Pesce',       color: '#2a93b8', building: 'building-k', food: 'fish' },
  cafe:     { label: 'Caffè',       color: '#8a5a34', building: 'building-b', food: 'cup-coffee' },
  trattoria:{ label: 'Trattoria',   color: '#7aa03a', building: 'building-l', food: 'salad' },
  dessert:  { label: 'Dolci',       color: '#e08bb0', building: 'building-f', food: 'cake' },
};

// Demo restaurants — a few real Italian references to make the island feel alive.
export const DEMO_RESTAURANTS = [
  { name: "L'Antica da Michele", category: 'pizza',    city: 'Napoli',  rating: 4.6, price: '€',    notes: 'La margherita di riferimento, da oltre un secolo.' },
  { name: 'Sushisen',            category: 'japanese', city: 'Milano',  rating: 4.4, price: '€€€',  notes: 'Omakase intimo, pesce che arriva ogni mattina.' },
  { name: 'Le Calandre',         category: 'fine',     city: 'Rubano',  rating: 4.9, price: '€€€€', notes: '3 stelle Michelin. Il regno degli Alajmo.' },
  { name: 'Burgez',              category: 'burger',   city: 'Milano',  rating: 4.1, price: '€€',   notes: 'Smash burger senza fronzoli, aperto fino a tardi.' },
  { name: 'Il Pescatore',        category: 'seafood',  city: 'Canneto', rating: 4.7, price: '€€€€', notes: 'Tempio del pesce d\'acqua dolce, tre generazioni.' },
  { name: 'Bar Luce',            category: 'cafe',     city: 'Milano',  rating: 4.3, price: '€',    notes: 'Caffè wesandersoniano dentro la Fondazione Prada.' },
  { name: 'Trattoria da Nennella', category: 'trattoria', city: 'Napoli', rating: 4.5, price: '€', notes: 'Chiassosa, generosa, autentica. Porta contanti.' },
  { name: 'Gelateria dei Neri',  category: 'dessert',  city: 'Firenze', rating: 4.8, price: '€',    notes: 'Ricotta e fichi che vale il viaggio.' },
];

let seq = 1;
export function makeId() { return 'r' + seq++; }
