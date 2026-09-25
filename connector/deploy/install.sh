#!/bin/sh
# Installa la scatola di un agente. Questo file lo serve la tua istanza, con
# dentro gia' l'indirizzo e il token: non c'e' niente da copiare a mano, e non
# c'e' un secondo tempo — il connettore fa da se' anche il primo avvio di Home
# Assistant.
#
#   curl -fsSL "https://tua-istanza/api/agents/<id>/install?t=<token>" | sudo sh
set -eu

BASE=@@BASE@@
AGENT=@@AGENT_ID@@
TOKEN=@@TOKEN@@
# Già scritti per il file .env. Nel heredoc qui sotto entrano come variabili,
# che la shell non rilegge: scritti lì dentro direttamente, un «$(…)» nel nome
# dell'agente sarebbe stato eseguito.
BACKEND_ENV=@@BACKEND_ENV@@
NAME_ENV=@@NAME_ENV@@
DIR=${DIR:-/opt/place-index}

say() { printf '%s\n' "$*"; }
die() { printf 'errore: %s\n' "$*" >&2; exit 1; }

# Serve Linux vero: il container deve stare sulla rete di casa, e quella
# dentro la VM di Docker Desktop non e' la rete di casa. Dentro WSL, o dentro
# una macchina virtuale con scheda bridged, questo e' Linux e va bene.
[ "$(uname -s)" = Linux ] || die "serve Linux. Su Windows apri WSL e rilancia qui; su Mac una VM Linux"
[ "$(id -u)" = 0 ] || die "serve root: rilancia con sudo"
command -v docker >/dev/null 2>&1 || die "docker non c'e'. Installalo (https://docs.docker.com/engine/install/) e rilancia"
docker compose version >/dev/null 2>&1 || die "manca il plugin 'docker compose'. Installalo e rilancia"

mkdir -p "$DIR"
cd "$DIR"

say 'scarico la composizione…'
curl -fsSL "$BASE/api/agents/$AGENT/compose.yml?t=$TOKEN" -o docker-compose.yml

# Un reinstallo non deve cambiare le chiavi di casa: la password di Home
# Assistant e' quella con cui ci entri, e cambiarla sotto il naso sarebbe
# scortese. Stessa cosa per un token messo a mano.
HA_PASSWORD=''
HA_TOKEN=''
if [ -f .env ]; then
  HA_PASSWORD=$(sed -n 's/^HA_PASSWORD=//p' .env)
  HA_TOKEN=$(sed -n 's/^HA_TOKEN=//p' .env)
fi

# Prima volta: una password lunga e casuale. Non la devi ricordare — te la
# stampiamo qui sotto e resta scritta in questo file, che e' leggibile solo da
# root.
if [ -z "$HA_PASSWORD" ]; then
  HA_PASSWORD=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

cat > .env <<ENV
BACKEND_URL=$BACKEND_ENV
AGENT_TOKEN=$TOKEN
AGENT_NAME=$NAME_ENV
HA_URL=http://localhost:8123
HA_USER=place-index
HA_PASSWORD=$HA_PASSWORD
HA_TOKEN=$HA_TOKEN
ENV
chmod 600 .env

# Un'installazione vecchia aveva un secondo tempo. Adesso non serve piu': via,
# se no un giorno qualcuno lo lancia e non capisce perche' non fa niente.
rm -f finish.sh

# Il connettore deve poter aggiungere a Home Assistant le integrazioni che non
# ha di serie, e gira come utente non privilegiato (`node`, uid 1000) mentre
# la configurazione di HA e' di root. Gli si apre solo questa cartella: HA
# continua a leggerla, e il resto della sua configurazione resta intoccabile.
mkdir -p "$DIR/homeassistant/custom_components"
chown -R 1000:1000 "$DIR/homeassistant/custom_components"

say 'avvio home assistant e il connettore…'
docker compose up -d

WHERE=$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')
[ -n "$WHERE" ] || WHERE=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -n "$WHERE" ] || WHERE=questo-computer

say ''
say 'Fatto. Il primo avvio di Home Assistant prende qualche minuto: il'
say 'connettore lo aspetta, crea l'"'"'utente e si prende le chiavi da solo.'
say ''
say 'Resta una cosa sola, e la puo'"'"' fare solo una persona col telefono:'
say 'collegare il tuo account Tuya scansionando un QR.'
say ''
say "  1. apri  http://$WHERE:8123"
say "  2. entra con   utente: place-index"
say "                 password: $HA_PASSWORD"
say '  3. Impostazioni → Dispositivi e servizi → Aggiungi integrazione → Tuya,'
say '     e scansiona il QR con l'"'"'app Smart Life'
say ''
say "La password sta anche in $DIR/.env, che legge solo root."
say ''
say "I log:  docker compose -f $DIR/docker-compose.yml logs -f connector"
say ''
