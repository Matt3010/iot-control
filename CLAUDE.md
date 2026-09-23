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

## Prima di dire che è fatto

Il lavoro si vede girare. `npx svelte-check`, `npx tsc -p server/tsconfig.json
--noEmit`, `npm run build:web` e `npm run frasi` passano, e quello che si vede
si guarda per davvero — con Playwright, o chiedendolo a chi sta davanti allo
schermo.
