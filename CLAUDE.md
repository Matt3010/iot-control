# Come si lavora su questo progetto

## Come si scrive quello che si legge

**Mai la forma «frase: frase».** Niente due punti che incollano una frase a
un'altra, né nelle etichette né nelle spiegazioni, né nei messaggi che
compaiono in un angolo dello schermo. Non è una preferenza di gusto: sono due
pensieri messi in fila senza dire che rapporto hanno, e chi legge deve
indovinarlo. Si scrivono due frasi, oppure una frase sola con dentro la
congiunzione che dice come stanno insieme.

```
NO   Avvisi accesi: te ne mando uno di prova
SÌ   Avvisi accesi. Te ne mando uno di prova.

NO   Copia non riuscita: il comando è quello che vedi
SÌ   Copia non riuscita, il comando è quello che vedi

NO   Nessun luogo: i filtri qui sopra li stanno escludendo tutti.
SÌ   Nessun luogo da mostrare, perché i filtri qui sopra li escludono tutti.
```

I due punti restano leciti solo dove introducono davvero un elenco («Ci
entrano e ci lavorano come te: luoghi, categorie, gruppi») o una cosa
riportata parola per parola.

**Mai far accordare una frase con un nome scelto da chi legge.** Di una
parola scritta da qualcun altro non si sa né il genere né se è una o tante:
«Casa si è collegato» ha il genere sbagliato, «collegata» ce l'ha per metà
degli altri nomi, e ««Luci accese» è partita» sbaglia anche il numero. O il
verbo resta invariabile, o davanti al nome c'è un sostantivo nostro che regge
la frase.

```
NO   {nome} si è collegato          «{nome}» è partita
SÌ   {nome} si collega              La scena «{nome}» è partita
```

Vale anche per i numeri: «1 dispositivi su 2» fa sembrare scritto male tutto
il resto, e quando non ha risposto nessuno la scena non è «partita a metà».

**Mai mettere parole in bocca a chi usa l'app.** Un campo dove si scrive un
testo nasce vuoto, con scritto cosa farci: una frase pensata da noi — «la
scena «{nome}» è partita» — la metà delle volte non è quello che voleva
dire, e cancellarla prima di scrivere la sua è lavoro in più. Un segnaposto
non finisce mai salvato; un valore proposto sì.

Il resto dello stile, che vale quanto la regola qui sopra:

- **Italiano, sempre.** Le parole che si leggono, i commenti, i messaggi di
  commit. Gli indirizzi e i nomi nel codice restano in inglese.
- **Si dice cosa è successo, non come si chiama.** «Ha ripreso a rispondere
  dopo due ore» e non «è tornato», che non dice tornato dove.
- **Quando qualcosa non funziona si dice quale pezzo manca**, non «errore».
  Una riga in più qui vale un supporto tecnico in meno.

Le prime due regole hanno un controllo automatico, `npm run frasi`, che passa
su tutte le frasi del progetto e si ferma se trova due punti in mezzo a una
frase o un verbo che si appoggia a un nome. Si lancia prima di dire che una
cosa è fatta.

## Le parole del prodotto

Una cosa, una parola. Chi ne usa due costringe chi legge a chiedersi se siano
la stessa cosa.

- **luogo** — il segno sulla mappa. Mai «posto».
- **agente** — il servizio installato su una macchina accesa in un luogo. È
  lui che tiene il filo, quindi è lui che si collega e che smette di
  rispondere. Un agente può non stare su nessun luogo.
- **dispositivo** — quello che un agente trova sulla rete di casa.
- **mappa** — il foglio su cui stanno i luoghi.

**Home Assistant non esiste**, per chi guarda. Non si nomina in niente di
visibile: non è un dettaglio che riguardi chi usa il sito, e nominarlo
sposterebbe su di lui il compito di capirlo.

## L'interfaccia

- Componenti, non copie. Se una cosa si disegna due volte diventa un pezzo
  suo, e se ne esiste già uno che fa quel lavoro si estende quello invece di
  scriverne un altro accanto.
- Premium vuol dire misurato: spazi che tornano, niente ombre dove il resto
  dell'app non ne ha, e niente vuoti grandi come mezza pagina.
- Ogni pezzo nuovo porta il suo commento sul perché esiste, non su cosa fa.
- **Una finestra sola.** Tutto quello che si apre davanti — la scheda di un
  luogo, categorie e gruppi, il registro, una soglia da scrivere — passa da
  `ui.openModal` e mostra un componente, che non sa di stare in una
  finestra. I tasti in fondo li detta il componente con `tasti()`
  (`lib/fondo.svelte.ts`), perché cambiano con lui. Niente `<aside>` nuovi.
- **Gli elenchi si guardano con una vista.** Ordine e ricerca passano da
  `lib/vista.svelte.ts`, mai da un `sort` o un filtro scritti nel componente.
  In una tabella si ordina dall'intestazione, in un elenco di schede con
  `ViewControls`; un elenco che arriva a pagine lo mette in fila il server.
  Un filtro nuovo è un'opzione in più della vista, non un metodo accanto.
- **«C'è una mappa?» si chiede a `viewport.hasMap`**, non a `viewport.narrow`.
  Il secondo dice quanto è largo lo schermo, e serve solo dove conta quello
  (la tastiera che si aprirebbe).
- **Le regole per il dito stanno dopo quelle che correggono.** Un
  `@media (hover: none)` scritto sopra alla regola normale perde a parità di
  peso senza dire niente, ed è successo quattro volte.

## Il filo

Ogni cosa che si scrive e che un'altra scheda aperta deve vedere manda un
evento con `hub.changed`, e `lib/live.svelte.ts` sa cosa farne. Una modifica
che arriva solo a chi l'ha fatta è una scheda che mente finché non la
ricarichi. Prima di dire che una cosa nuova è fatta si apre in due schede e
si guarda l'altra.

## I dispositivi e le marche

Un dispositivo è un dispositivo vero, non un'entità della centrale: l'agente
mette insieme l'entità che si comanda con le letture e le impostazioni dello
stesso dispositivo (`connector/src/gruppi.ts`). Una capacità che viene da
un'altra entità ha il codice `<entità>#<codice>`, e l'agente sa a chi mandare
il comando. Le funzioni in più di una marca arrivano da sole come levette,
cursori ed elenchi (`setting` nel protocollo), come fa Alexa con i suoi
comandi generici: prima di scrivere un ponte per una marca si guarda se la
centrale la espone già così, o se si capisce dal comportamento.

Si può collegare tutto il catalogo della centrale. I registri
(`connector/src/providers.ts`, `src/lib/providers.ts`) servono solo a chi ha
bisogno di qualcosa in più: un'integrazione da installare, istruzioni scritte
da noi, un lettore di impulsi.

Un dispositivo non si cancella da solo. La presentazione di un agente
aggiunge e aggiorna, perché arriva prima che l'agente abbia letto la
centrale. L'inventario completo segna come spariti quelli che mancano
(`goneAt`), e restano con le loro scene e i loro avvisi: se tornano, con lo
stesso nome interno, sono gli stessi di prima. Se ne vanno solo con
«Rimuovi», e allora si portano via le righe, le partenze e le condizioni che
li nominavano. Un dispositivo che ne assorbe un altro si porta dietro le
scene e gli avvisi scritti su di lui.

## Le prove sui dispositivi

«Quando la porta si apre», «sopra 25 gradi» sono la stessa domanda per gli
avvisi e per le scene, e hanno un motore solo. `server/src/rules/prove.ts`
decide se vale e se è appena successo, `src/lib/prove.ts` dice come si legge
e cosa si può scegliere. Scattano sul passaggio, non sullo stato.

Una scena non può far ripartire sé stessa, né da sola né passando per altre
scene: il server rifiuta di salvarla così (`rules/giri.ts`) e dice il giro.
Conta se un comando può davvero far scattare la partenza, e «quando si
accende, spegni» non è un giro. Quello che dai dati non si vede — una presa
che accende un sensore — lo ferma un fusibile: più di dieci partenze da sola
in un minuto e la scena si ferma, con un avviso. Sotto la soglia ogni
cambiamento la fa partire, da qualunque parte arrivi.

Due scene che possono partire nello stesso momento non danno ordini diversi
alla stessa cosa: il server rifiuta di salvarle così (`rules/scontri.ts`) e
dice con quale scena e su quale dispositivo si scontrano. Si blocca solo
quello che si può prevedere, cioè lo stesso orario negli stessi giorni o lo
stesso cambiamento dello stesso dispositivo.

## L'archivio

I dati stanno in Postgres, e ci si parla solo dai repository: un manager non
scrive SQL e non sa che tabelle esistono. Ogni metodo di un manager è una
transazione sola — `store.transaction(async (tx) => …)` — e quello che sta
dentro o succede tutto o non succede niente.

- **Niente leggi-modifica-riscrivi su un numero.** Un contatore si somma
  dentro al database (`views + 1`), se no due visite nello stesso istante ne
  contano una. Lo stesso vale per chi si prende un turno: la condizione sta
  dentro alla scrittura, e chi vince è chi si vede tornare indietro una riga.
- **Lo schema dice cosa si porta via cosa.** Un agente eliminato porta con sé
  i suoi dispositivi, e quelli le regole scritte su di loro. Quando serve
  sapere *quante* ne sono cadute bisogna contarle prima di toglierle.
- **Niente parole di SQL come nome di colonna.** `when`, `only`, `order` e
  le altre funzionano finché l'ORM mette le virgolette e si rompono al primo
  SQL scritto a mano. Il nome in TypeScript può restare quello, la colonna
  no (`only` → `conditions`, `when` → `timing`).
- **Le ore sono nel fuso dell'account** (`users.tz`), mai in quello del
  browser o del server, perché le scene partono all'ora di chi le ha
  scritte anche se chi guarda è altrove. Sul client è `auth.tz`, sul server
  `UserRepository.tzOf`.
- **Una migrazione per ogni modifica allo schema**, generata con
  `npm run db:genera` e letta prima di lanciarla. Il server le applica da sé
  quando parte.
- Per lavorarci in locale serve un Postgres: `docker run -d --name
  place-index-pg -e POSTGRES_USER=place -e POSTGRES_PASSWORD=place -e
  POSTGRES_DB=place_index -p 5432:5432 postgres:17-alpine`.

## Prima di dire che è fatto

Il lavoro si vede girare. `npx svelte-check`, `npx tsc -p server/tsconfig.json
--noEmit`, `npm run build:web` e `npm run frasi` passano, e quello che si vede
si guarda per davvero — con Playwright, o chiedendolo a chi sta davanti allo
schermo.
