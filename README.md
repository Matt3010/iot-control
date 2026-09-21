# Place Index

Mappa a schermo intero dove segni i posti che ti interessano. Ogni posto appartiene a una
categoria, e ogni categoria ha una sua emoji e un suo colore: il marker sulla mappa è quello.
Niente account, niente categorie preimpostate, niente fronzoli.

![Place Index](docs/preview.png)

## Cosa fa

- **Mappa full-screen** (Leaflet + tile OpenStreetMap, nessuna API key).
- **Aggiungi posto**: premi il bottone, clicca il punto sulla mappa (il pin si può trascinare),
  dai nome, categoria e note. Il pin compare subito: il salvataggio viaggia dietro, e se il
  server rifiuta la riga torna indietro da sola.
- **L'indice nel pannello**: i posti inquadrati in quel momento, dal più vicino al centro
  mappa. Passi sopra una riga e il suo pin si solleva; ci clicchi e la mappa ci vola aprendo
  la scheda.
- **Cluster**: quando i pin si accavallano diventano un disco che porta i colori delle
  categorie che contiene, e si apre allo zoom.
- **Ricerca**: cerca un indirizzo o un locale (Nominatim); dal risultato apri direttamente il
  form già compilato con nome e indirizzo.
- **Categorie**: le crei tu, con emoji scelta da un picker completo
  ([emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element), dati serviti in
  locale — funziona anche senza rete esterna) e un colore. Eliminare una categoria elimina anche
  i suoi posti.
- **Filtri**: i chip in alto a sinistra accendono/spengono le categorie sulla mappa (preferenza
  locale del browser).
- **Niente finestre di conferma**: elimini un posto o una categoria e sparisce subito, con
  sei secondi di "Annulla" nel toast. Solo allo scadere la cancellazione parte davvero.
- I dati stanno sul server in un unico `places.json`: chiunque apra la pagina vede lo stesso indice.

## L'interfaccia

Tutta la UI è un solo strato di pannelli in vetro sopra la mappa: un'unica scala tipografica
(Inter, servito in locale), una scala di ombre, una di raggi, una di z-index. La mappa è
desaturata via CSS così l'unico colore acceso sullo schermo è un marker. Tema chiaro e scuro
seguono il sistema (`prefers-color-scheme`), incluse le tile, e le animazioni si spengono con
`prefers-reduced-motion`. Niente font, icone o dati emoji presi da una CDN: tutto è nel bundle
([Inter](https://fontsource.org/fonts/inter), [Lucide](https://lucide.dev),
[emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element)).

Lo stile sta in `src/styles/`, un file per area, caricati in quest'ordine da `index.css`:

| file | cosa tiene |
| --- | --- |
| `tokens.css` | colori, inchiostri, ombre, z-index, geometria — e i loro gemelli scuri |
| `base.css` | reset, cornice di pagina, la superficie in vetro, i due stili di testo |
| `controls.css` | campi, bottoni, chip, bottone emoji, pastiglia del colore |
| `panel.css` | il pannello sinistro: ricerca, filtri, indice |
| `sheets.css` | le due sheet di destra e il popover delle emoji |
| `map.css` | pin, cluster, popup e il chrome di Leaflet ridisegnato |
| `hud.css` | bottone aggiungi, pill del suggerimento, toast |
| `animations.css` | tutti i keyframe, e l'interruttore che li spegne |

Ogni file si porta dietro le proprie regole per lo schermo stretto: non c'è un file
"responsive" separato da tenere allineato.

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
