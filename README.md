# 🍕 Restaurant Index

Il mio indice personale dei ristoranti, reso come un **mondo isometrico voxel/low-poly**
con [Three.js](https://threejs.org/). Ogni ristorante è un edificio su un'isola: ci clicchi
sopra e si apre la scheda con categoria, voto, prezzo e note.

![anteprima](docs/preview.png)

## ✨ Cosa fa

- **Isola isometrica 3D** generata proceduralmente, con acqua animata, alberi, fiori e funghi.
- **Ogni ristorante = un edificio** low-poly, con un "totem" di cibo che gira accanto
  (pizza, sushi, vino…) e una pedana colorata per categoria.
- **Cartelli di legno** fluttuanti con il nome del ristorante e un pallino colore-categoria.
- **Clic su un edificio / cartello** → scheda dettaglio + la camera ci zooma sopra.
- **Ricerca** per nome, cucina, città o note (evidenzia i risultati e vola sull'unico match).
- **Sidebar** Index / Map / Saved e vista "salvati".
- **➕ Aggiungi** un ristorante dal browser: compare subito sull'isola. I preferiti
  restano salvati in `localStorage`.

## 🎮 Controlli

| Azione | Come |
|--------|------|
| Ruotare | trascina con il tasto sinistro |
| Zoom | rotellina / pizzica su mobile |
| Pan | tasto destro (o due dita) |
| Aprire un ristorante | clic sull'edificio o sul cartello |

## 🚀 Avvio

```bash
npm install
npm run dev      # server di sviluppo (Vite)
npm run build    # build di produzione in dist/
npm run preview  # anteprima della build
```

## 🧱 Struttura

```
public/assets/models/   # modelli GLB (edifici, natura, cibo) + texture colormap
src/
  main.js               # renderer, camera isometrica ortografica, luci, raycast, loop
  world.js              # generazione isola, terreno instanced, acqua, posizionamento
  assets.js             # GLTFLoader con cache + normalizzazione dei modelli
  data.js               # categorie + ristoranti demo
  ui.js                 # ricerca, sidebar, scheda, modale "Aggiungi", preferiti
  style.css             # interfaccia (stile "cartello di legno")
```

I dati dei ristoranti al momento partono da un set demo (`src/data.js`). I preferiti sono
salvati nel browser; l'aggiunta di ristoranti è in memoria/`localStorage`.
Prossimo passo naturale: persistere l'elenco (JSON versionato o piccolo backend).

## 🎨 Crediti asset — tutti CC0

I modelli 3D sono di **[Kenney](https://kenney.nl)**, rilasciati in
**[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)** (dominio pubblico,
uso libero anche commerciale, senza attribuzione obbligatoria — ma un grazie è doveroso):

- [Nature Kit](https://kenney.nl/assets/nature-kit) — alberi, fiori, funghi, erba
- [City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial) — edifici
- [Food Kit](https://kenney.nl/assets/food-kit) — i "totem" di cibo

Per aggiungere altri pacchetti: scarica lo zip da kenney.nl, copia i `.glb` (formato GLTF/GLB)
in `public/assets/models/…`, includendo la cartella `Textures/colormap.png` accanto ai
modelli City/Food (usano una texture-atlante esterna), e referenziali da `data.js`.

Librerie: [Three.js](https://threejs.org/) (MIT), [Vite](https://vitejs.dev/) (MIT).
Font: [Baloo 2](https://fonts.google.com/specimen/Baloo+2) e
[Nunito](https://fonts.google.com/specimen/Nunito) (OFL).
