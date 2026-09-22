#!/bin/sh
# Installa la scatola di una casa. Questo file lo serve la tua istanza, con
# dentro già l'indirizzo e il token: non c'è niente da copiare a mano.
#
#   curl -fsSL https://tua-istanza/api/agents/<id>/install | sudo sh
set -eu

BASE=@@BASE@@
AGENT=@@AGENT_ID@@
TOKEN=@@TOKEN@@
NAME=@@NAME@@
DIR=${DIR:-/opt/place-index}

say() { printf '%s\n' "$*"; }
die() { printf 'errore: %s\n' "$*" >&2; exit 1; }

# Serve Linux vero: il container deve stare sulla rete di casa, e quella
# dentro la VM di Docker Desktop non è la rete di casa. Dentro WSL, o dentro
# una macchina virtuale con scheda bridged, questo è Linux e va bene.
[ "$(uname -s)" = Linux ] || die "serve Linux. Su Windows apri WSL e rilancia qui; su Mac una VM Linux"
[ "$(id -u)" = 0 ] || die "serve root: rilancia con sudo"
command -v docker >/dev/null 2>&1 || die "docker non c'è. Installalo (https://docs.docker.com/engine/install/) e rilancia"
docker compose version >/dev/null 2>&1 || die "manca il plugin 'docker compose'. Installalo e rilancia"

mkdir -p "$DIR"
cd "$DIR"

say "scarico la composizione…"
curl -fsSL "$BASE/api/agents/$AGENT/compose.yml?t=$TOKEN" -o docker-compose.yml

# Un reinstallo non deve buttare via il token di Home Assistant: quello lo hai
# creato a mano, e ricrearlo è la parte noiosa.
if [ -f .env ]; then
  HA_TOKEN=$(grep '^HA_TOKEN=' .env | cut -d= -f2- || true)
else
  HA_TOKEN=""
fi

cat > .env <<ENV
BACKEND_URL=@@BACKEND_URL@@
AGENT_TOKEN=$TOKEN
AGENT_NAME=$NAME
HA_URL=http://localhost:8123
HA_TOKEN=$HA_TOKEN
ENV
chmod 600 .env

# Il secondo tempo, quando avrai il token di HA in mano.
cat > finish.sh <<'FINISH'
#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo "serve root" >&2; exit 1; }
[ $# -eq 1 ] || { echo "uso: $0 <token-di-home-assistant>" >&2; exit 1; }
cd "$(dirname "$0")"
sed -i "s|^HA_TOKEN=.*|HA_TOKEN=$1|" .env
docker compose up -d
echo
echo "fatto. I log:  docker compose -f $(pwd)/docker-compose.yml logs -f connector"
FINISH
chmod 700 finish.sh

say "avvio home assistant…"
docker compose up -d homeassistant

WHERE=$(hostname -I 2>/dev/null | awk '{print $1}')
WHERE=${WHERE:-questo-computer}

say ""
say "Home Assistant sta partendo. Il primo avvio prende qualche minuto."
say ""
say "Ora, dal browser:"
say "  1. apri  http://$WHERE:8123  e crea il tuo utente"
say "  2. Impostazioni → Dispositivi e servizi → Aggiungi integrazione → Tuya,"
say "     e scansiona il QR con l'app Smart Life"
say "  3. clicca sul tuo nome in basso a sinistra → Token di lunga durata →"
say "     creane uno e copialo"
say ""
say "Poi torna qui e lancia:"
say "  sudo $DIR/finish.sh <il-token-che-hai-copiato>"
say ""
