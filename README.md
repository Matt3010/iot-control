# Place Index

Mappa a schermo intero dove segni i posti che ti interessano. Ogni posto appartiene a una
categoria, e ogni categoria ha una sua emoji e un suo colore: il marker sulla mappa è quello.
Niente account, niente categorie preimpostate, niente fronzoli.

## Cosa fa

- **Mappa full-screen** (Leaflet + tile OpenStreetMap, nessuna API key).
- **Aggiungi posto**: premi il bottone, clicca il punto sulla mappa (il pin si può trascinare),
  dai nome, categoria e note.
- **Ricerca**: cerca un indirizzo o un locale (Nominatim); dal risultato apri direttamente il
  form già compilato con nome e indirizzo.
- **Categorie**: le crei tu, con emoji scelta da un picker completo
  ([emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element), dati serviti in
  locale — funziona anche senza rete esterna) e un colore. Eliminare una categoria elimina anche
  i suoi posti.
- **Filtri**: i chip in alto a sinistra accendono/spengono le categorie sulla mappa (preferenza
  locale del browser).
- I dati stanno sul server in un unico `places.json`: chiunque apra la pagina vede lo stesso indice.

## Pubblicare con Docker

```bash
docker compose up -d --build
```

Poi apri <http://localhost:8080>. I dati finiscono nel volume `place-index-data` montato su `/data`.

Senza compose:

```bash
docker build -t place-index .
docker run -d --name place-index -p 8080:8080 -v place-index-data:/data place-index
```

Per tenere i dati in una cartella del host invece che in un volume:
`-v /percorso/sul/host:/data`.

Variabili d'ambiente: `PORT` (default `8080`), `DATA_DIR` (default `/data` nell'immagine).

> Non c'è autenticazione: se lo esponi su internet, mettilo dietro un reverse proxy con basic
> auth o su una rete privata.

## Sviluppo

```bash
npm install
npm run dev     # Vite su :5173 con proxy /api verso il server Node su :8080
```

`npm run build` genera `dist/`, `npm start` avvia il server che serve API e `dist/` insieme.

## API

| Metodo   | Rotta                  | Note                                         |
| -------- | ---------------------- | -------------------------------------------- |
| `GET`    | `/api/state`           | `{ categories, places }`                     |
| `POST`   | `/api/categories`      | `{ name, emoji, color }`                     |
| `PUT`    | `/api/categories/:id`  | patch parziale                               |
| `DELETE` | `/api/categories/:id`  | elimina anche i posti della categoria        |
| `POST`   | `/api/places`          | `{ name, categoryId, lat, lng, note }`       |
| `PUT`    | `/api/places/:id`      | patch parziale                               |
| `DELETE` | `/api/places/:id`      |                                              |
