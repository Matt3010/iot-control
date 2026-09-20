# 🚀 Restaurant Index

Il mio indice personale dei ristoranti, reso come un **diorama spaziale isometrico**
con [Three.js](https://threejs.org/) — nello stile del
[Kenney Space Kit](https://kenney.nl/assets/space-kit). Una colonia rocciosa che
galleggia nel buio: ogni ristorante è una struttura, ci clicchi sopra e si apre la
scheda con categoria, voto, prezzo e note. Astronauti (e qualche alieno) girano tra
gli avamposti.

![anteprima](docs/preview.png)

## ✨ Cosa fa

- **Isola-colonia galleggiante** generata proceduralmente: terreno roccioso a
  **livelli/terrazze**, base rastremata che galleggia nel vuoto, sfondo scuro,
  luci da studio con ombre morbide e vignettatura — la resa del sample Kenney.
- **Ogni ristorante = una struttura spaziale** (hangar, cupole, gantry) con una
  **piazzola colorata** per categoria e un piccolo prop a tema che ruota accanto
  (parabola, rover, navetta…).
- **Razzo** centrale assemblato dai pezzi del kit, parabole, rover, navette in
  hovering, barili, rocce, crateri e meteore sparsi come nel diorama.
- **Astronauti e alieni** che camminano a saltelli tra le strutture.
- **Etichette olografiche** fluttuanti con nome + pallino colore-categoria.
- **Clic su una struttura / etichetta** → scheda dettaglio + zoom della camera.
- **Ricerca** per nome, cucina, città o note; **sidebar** Index / Map / Saved.
- **➕ Aggiungi** un ristorante dal browser: compare subito sulla colonia. I
  preferiti restano salvati in `localStorage`.

## 🎮 Controlli

| Azione | Come |
|--------|------|
| Ruotare | trascina con il tasto sinistro |
| Zoom | rotellina / pizzica su mobile |
| Pan | tasto destro (o due dita) |
| Aprire un ristorante | clic sulla struttura o sull'etichetta |

## 🚀 Avvio

```bash
npm install
npm run dev      # server di sviluppo (Vite)
npm run build    # build di produzione in dist/
npm run preview  # anteprima della build
```

## 🧱 Struttura

```
public/assets/models/space/   # modelli GLB del Kenney Space Kit
src/
  main.js                     # renderer, camera iso ortografica, luci studio, raycast, loop
  world.js                    # terreno a livelli, base galleggiante, strutture, props, astronauti
  assets.js                   # GLTFLoader con cache + normalizzazione dei modelli
  data.js                     # categorie (→ strutture) + ristoranti demo
  ui.js                       # ricerca, sidebar, scheda, modale "Aggiungi", preferiti
  style.css                   # interfaccia "mission control"
```

I dati partono da un set demo (`src/data.js`); i preferiti e i ristoranti aggiunti
vivono in `localStorage`. Prossimo passo naturale: persistenza versionata o backend.

## 🎨 Crediti asset — CC0

Modelli 3D di **[Kenney](https://kenney.nl)**, in
**[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)** (dominio pubblico,
uso libero anche commerciale):

- **[Space Kit](https://kenney.nl/assets/space-kit)** — strutture, razzo, veicoli,
  parabole, astronauti/alieni, rocce e crateri. La palette del terreno
  (`#e88463` / `#b25f43`) è quella originale del kit.

Per aggiungere altri pezzi: scarica lo zip da kenney.nl, copia i `.glb`
(formato GLTF/GLB, autonomi) in `public/assets/models/space/` e referenziali da
`data.js` / `world.js`.

Librerie: [Three.js](https://threejs.org/) (MIT), [Vite](https://vitejs.dev/) (MIT).
Font: [Baloo 2](https://fonts.google.com/specimen/Baloo+2) e
[Nunito](https://fonts.google.com/specimen/Nunito) (OFL).
