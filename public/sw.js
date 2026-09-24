/*
 * Il pezzo che resta sveglio quando l'app è chiusa.
 *
 * Non fa niente di quello che fanno di solito i service worker — niente
 * cache, niente offline: l'app vuole dati freschi, e una copia vecchia di una
 * mappa di luoghi è peggio di una mappa che non si apre. Serve a una cosa
 * sola: ricevere un avviso quando il telefono è in tasca e mostrarlo.
 *
 * È in `public/` e non fra i sorgenti perché deve stare nella radice del
 * sito: un service worker può parlare solo per le pagine che stanno sotto di
 * lui, e da una sottocartella non vedrebbe niente.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  /*
   * Senza dati non si inventa niente: certi servizi di consegna mandano un
   * colpo a vuoto per tenere viva l'iscrizione, e una notifica vuota sullo
   * schermo di qualcuno è peggio di nessuna notifica.
   */
  let note = {};
  try {
    note = event.data ? event.data.json() : {};
  } catch {
    note = {};
  }
  if (!note.title) return;

  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body ?? '',
      // due avvisi sulla stessa cosa si sostituiscono invece di impilarsi
      tag: note.tag ?? 'avviso',
      renotify: !!note.tag,
      icon: '/icona-192.png',
      badge: '/badge.png',
      data: { goto: note.goto ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const dove = (event.notification.data && event.notification.data.goto) || '/';

  /*
   * Se l'app è già aperta da qualche parte si va lì, invece di aprirne
   * un'altra: ritrovarsi tre copie dello stesso sito dopo tre avvisi è il
   * modo più veloce per far spegnere le notifiche a qualcuno.
   */
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((aperte) => {
      for (const finestra of aperte) {
        if ('focus' in finestra) {
          finestra.navigate?.(dove);
          return finestra.focus();
        }
      }
      return self.clients.openWindow(dove);
    }),
  );
});

/*
 * Il browser ha rinnovato l'iscrizione, o l'ha lasciata scadere.
 *
 * Succede da sé, senza che nessuno apra l'app, e dopo gli avvisi vanno a un
 * indirizzo che non c'è più. Senza dirlo al server la levetta restava
 * accesa e non arrivava più niente. Qui si prende l'iscrizione nuova, o se
 * ne chiede una con la stessa chiave, e si consegna al server togliendo
 * quella vecchia.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const vecchia = event.oldSubscription;
      let nuova = event.newSubscription;
      // Senza la nuova la si chiede con la chiave di quella vecchia. Se non c'è
      // nemmeno quella non si può fare niente da qui, e la levetta lo dirà
      // spenta la prossima volta che si apre l'app.
      if (!nuova) {
        const chiave = vecchia && vecchia.options && vecchia.options.applicationServerKey;
        if (!chiave) return;
        nuova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiave });
      }

      const dati = nuova.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: dati.endpoint,
          p256dh: dati.keys && dati.keys.p256dh,
          auth: dati.keys && dati.keys.auth,
          agent: macchina(),
        }),
      });
      if (vecchia && vecchia.endpoint !== dati.endpoint) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: vecchia.endpoint }),
        }).catch(() => undefined);
      }
    })(),
  );
});

/**
 * Che macchina è, in due parole, detto come lo dice l'app quando ci si
 * iscrive da lì (`whichMachine` in `lib/push.svelte.ts`). È una copia
 * perché qui dentro i moduli dell'app non arrivano, e senza il nome la
 * macchina nell'elenco resterebbe senza.
 */
function macchina() {
  const ua = self.navigator.userAgent;
  const sistema = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : 'Computer';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : 'Safari';
  return `${sistema} · ${browser}`;
}
