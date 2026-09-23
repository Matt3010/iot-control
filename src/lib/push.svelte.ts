import { api } from './api';

/**
 * Gli avvisi sul telefono, dal lato di chi li riceve.
 *
 * Fra «ho detto di sì» e «mi arriva davvero una notifica» ci sono sei cose
 * che possono andare storte, e quasi tutte sono fuori dal nostro controllo:
 * il browser che non le sa fare, il permesso negato, l'app che su iPhone deve
 * stare nella schermata home. Qui si tiene il conto di dove siamo, perché
 * l'interfaccia possa dire cosa manca invece di un «non funziona».
 */

/** Quante ne sono partite e quante sono state respinte: due guasti diversi. */
export interface Esito {
  sent: number;
  failed: number;
}

/** Come si passa dalla chiave pubblica, che è testo, a quello che vuole il browser. */
function bytesOf(base64: string): Uint8Array {
  const dritto = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(dritto);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/** Che macchina è, in due parole: serve a riconoscerla in un elenco. */
function whichMachine(): string {
  const ua = navigator.userAgent;
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

/**
 * Da un errore di sistema a una frase che si legge.
 *
 * Quasi tutti questi guasti non sono di chi guarda e non si risolvono da
 * qui: dire quale è successo serve a sapere se vale la pena riprovare o se
 * bisogna aspettare noi.
 */
function excuse(error: unknown): string {
  const detto = error instanceof Error ? error.message : String(error);

  if (/mime|script|register|ServiceWorker/i.test(detto))
    return 'Questa copia del sito non è al completo: manca il pezzo che resta in ascolto mentre l’app è chiusa. Non dipende da questo telefono — riprova fra un po’.';

  if (/applicationServerKey|subscribe|push service/i.test(detto))
    return 'Il servizio di consegna del browser ha rifiutato l’iscrizione. Succede quando il telefono è senza rete o quando il sito era stato iscritto con una chiave diversa: spegni e riaccendi.';

  return `Non si è riusciti ad accenderli: ${detto}`;
}

class Push {
  /** Se questo browser le sa fare. */
  can = $state(false);
  /** `default` non ha ancora deciso, `granted` sì, `denied` no e non si richiede. */
  permission = $state<NotificationPermission>('default');
  /** Se questa macchina è iscritta adesso. */
  on = $state(false);
  /** Mentre si accende o si spegne: il tasto non si preme due volte. */
  busy = $state(false);
  /**
   * Su iPhone le notifiche arrivano solo a un'app aggiunta alla schermata
   * home. Non è un nostro limite e non si può aggirare: si può solo dirlo.
   */
  needsInstall = $state(false);
  /**
   * Perché non si sono accesi, quando non si accendono.
   *
   * Senza questo la levetta tornava indietro da sola e non diceva niente, e
   * «non funziona» è la cosa meno utile che un'interfaccia possa dire: la
   * prima volta che è successo davvero mancava un file sul server, e da qui
   * non si poteva sapere.
   */
  why = $state('');

  async look(): Promise<void> {
    this.can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!this.can) {
      // Un iPhone col browser normale non ce l'ha: diventa capace appena
      // l'app sta nella schermata home, e allora vale la pena dirglielo.
      this.needsInstall = /iPhone|iPad/.test(navigator.userAgent) && !this.#standalone();
      return;
    }

    this.permission = Notification.permission;
    const reg = await navigator.serviceWorker.getRegistration();
    this.on = !!(await reg?.pushManager.getSubscription());
  }

  /** Accendere: il permesso, l'iscrizione, e dirlo al server. */
  async enable(): Promise<boolean> {
    if (this.busy) return this.on;
    this.busy = true;
    this.why = '';

    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      this.permission = await Notification.requestPermission();
      if (this.permission !== 'granted') return false;

      const { key } = await api.get<{ key: string }>('/push/key');
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Senza questo la notifica arriverebbe senza poter essere letta da
          // nessuno: è la chiave con cui il servizio di consegna sa che siamo
          // noi, e con cui il browser cifra quello che riceve.
          userVisibleOnly: true,
          applicationServerKey: bytesOf(key) as BufferSource,
        }));

      await this.#tell(sub);

      this.on = true;
      return true;
    } catch (error) {
      this.why = excuse(error);
      return false;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Spegnere: qui e sul server.
   *
   * Il permesso del browser resta dato — quello non si può ritirare da
   * codice, e va bene così: riaccenderle non deve richiedere di nuovo il
   * permesso a chi l'aveva già dato.
   */
  async disable(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      this.on = false;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Una di prova a sé stessi: l'unico modo di sapere che arrivano davvero.
   *
   * Se non ne parte nessuna, questa macchina si crede iscritta e il server
   * non la conosce — l'iscrizione l'ha presa il browser, ma la riga non è
   * mai arrivata: la rete caduta un attimo, o una copia del sito senza il
   * pezzo che resta in ascolto. Allora si riconsegna l'indirizzo e si
   * riprova una volta, invece di lasciare un tasto che non fa niente.
   */
  async tryIt(): Promise<Esito> {
    if (this.busy) return { sent: 0, failed: 0 };
    this.busy = true;

    try {
      const primo = await api.post<Esito>('/push/test', {});
      // respinte vuol dire che il server ci conosce: reiscriversi non
      // servirebbe a niente e nasconderebbe il guasto vero
      if (primo.sent || primo.failed) return primo;

      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) {
        this.on = false;
        return primo;
      }

      await this.#tell(sub);
      return await api.post<Esito>('/push/test', {});
    } finally {
      this.busy = false;
    }
  }

  /** Dire al server dove consegnare, e da quale macchina lo stiamo dicendo. */
  async #tell(sub: PushSubscription): Promise<void> {
    const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    await api.post('/push/subscribe', {
      endpoint: raw.endpoint,
      p256dh: raw.keys?.p256dh,
      auth: raw.keys?.auth,
      agent: whichMachine(),
    });
  }

  #standalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  }
}

export const push = new Push();
