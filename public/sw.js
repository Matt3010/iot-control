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
