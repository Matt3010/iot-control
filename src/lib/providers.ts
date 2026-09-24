import type { Handler } from '../../shared/protocol';

/**
 * Le cose che si possono collegare a un agente, e come si spiegano.
 *
 * Stavano in due componenti: l'elenco con i nomi e gli avvisi in uno, i nomi
 * dei campi e le istruzioni per marca nell'altro, dentro una fila di `if`.
 * Un provider nuovo andava cercato in tutti e due. Adesso è una voce qui, e
 * i componenti non sanno che marche esistono.
 *
 * Qui c'è solo come si dice a una persona. Come si installa e come si legge
 * un provider lo sa l'agente, nel suo registro (connector/src/providers.ts),
 * e il nome che li lega è `Handler`.
 */

/** Un paragrafo di istruzioni. È testo nostro, con qualche `<b>` e `<i>` dentro. */
export interface Istruzione {
  html: string;
  /** Quello su cui si sbaglia più spesso, detto con più peso. */
  attento?: boolean;
}

export interface Provider {
  handler: Handler;
  label: string;
  /** Se se ne può avere più d'uno: una telecamera per canale, sì; un account, no. */
  many: boolean;
  /** Come si chiama la riga per aggiungerne un altro. */
  more: string;
  /** Cosa succede premendo, detto prima. */
  warns: string;
  /**
   * I nomi dei campi detti per questa marca. `username` per eWeLink è
   * l'email dell'app; per una telecamera è l'utente che chiede lei, e
   * chiamarlo «email» fa credere che serva la tua.
   */
  campi?: Record<string, string>;
  /** Cosa scrivere sopra ai campi da riempire. */
  istruzioni?: Istruzione[];
  /** Cosa scrivere sopra a un QR da inquadrare, se questa marca ne mostra uno. */
  qr?: string;
}

export const PROVIDERS: readonly Provider[] = [
  {
    handler: 'tuya',
    label: 'Tuya',
    many: false,
    more: '',
    warns: "Ti verrà chiesto il codice che sta nell'app Smart Life, e poi un QR da inquadrare.",
    istruzioni: [
      {
        html: 'Serve il tuo codice utente. Nell’app <b>Smart Life</b> (o Tuya Smart): <i>Impostazioni</i> → <i>Account e sicurezza</i>, alla voce <i>User Code</i>.',
      },
      { html: 'Copialo <b>esattamente</b> com’è, perché maiuscole e minuscole contano.', attento: true },
    ],
    qr: 'Inquadra questo codice con l’app <b>Smart Life</b> (o Tuya Smart). Quando l’app ha finito, conferma qui sotto.',
  },
  {
    handler: 'sonoff',
    label: 'eWeLink',
    many: false,
    more: '',
    warns:
      "La prima volta l'agente aggiunge il supporto eWeLink e si riavvia, e ci vuole un minuto. Poi ti chiederà le credenziali dell'app.",
    campi: { username: 'Email o numero di telefono' },
    istruzioni: [
      {
        html: 'Entra con le stesse credenziali che usi nell’app <b>eWeLink</b>: l’email <b>intera</b>, oppure il numero di telefono.',
      },
    ],
  },
  {
    handler: 'generic',
    label: 'Telecamera',
    /**
     * Di telecamere invece ce ne sono quante ne ha il registratore, una per
     * canale, e ognuna è un collegamento a sé: si stacca da sola, senza
     * portarsi via le altre.
     */
    many: true,
    more: 'Un’altra telecamera',
    warns:
      "Ti chiederà l'indirizzo del flusso — di solito una riga che comincia per rtsp:// — e come raggiungerlo. Si fa una telecamera per volta, quindi con un registratore da quattro si ripete quattro volte.",
    campi: { username: 'Utente della telecamera', password: 'Password della telecamera' },
    istruzioni: [
      {
        html: 'Serve l’indirizzo del flusso, una riga che comincia per <b>rtsp://</b>, quella che ti dà il registratore o la telecamera. Un canale per volta.',
      },
      {
        html: 'Se l’immagine non arriva, scegli <b>TCP</b>: certi registratori dichiarano un indirizzo di ritorno che non esiste più, e solo il TCP lo ignora.',
        attento: true,
      },
    ],
  },
];
