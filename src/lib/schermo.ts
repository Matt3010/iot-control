/**
 * Quanto schermo resta sotto alla nostra pagina, quando l'app è installata.
 *
 * Installata nella schermata home, con la barra di stato trasparente, la
 * pagina comincia sotto l'orologio, ma lo spazio su cui si appoggiano le
 * cose «in fondo» finiva prima del fondo vero: tutto quello che si
 * appoggiava in basso — il pannello, le finestre, i foglietti, le pagine —
 * si fermava lì, e sotto restava una fascia vuota alta quanto la barra di
 * stato. Altre app installate arrivano in fondo, quindi il limite era nel
 * modo in cui ci misuriamo noi.
 *
 * Non si corregge con un numero fisso. Si mette una sonda grande quanto lo
 * spazio che usa il nostro layout e la si confronta con lo schermo: se
 * manca qualcosa, la pagina si allunga di quel tanto. Dove non manca
 * niente la misura dà zero, e non cambia niente.
 *
 * Solo su iOS installato (`navigator.standalone` esiste solo lì). Altrove la
 * differenza fra schermo e finestra è vera — la barra del browser, quella
 * dei tasti di Android — e allungare la pagina la manderebbe là sotto.
 */
export function misuraIlFondo(): void {
  if ((navigator as { standalone?: boolean }).standalone !== true) return;

  // appesa a <html> e non a <body>: il corpo è quello che si allunga, e la
  // sonda deve misurare lo spazio di prima
  const sonda = document.createElement('div');
  sonda.setAttribute('aria-hidden', 'true');
  sonda.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
  document.documentElement.append(sonda);

  const aggiorna = (): void => {
    // lo schermo di iOS resta misurato in verticale anche girando il telefono
    const orizzontale = window.matchMedia('(orientation: landscape)').matches;
    const schermo = orizzontale
      ? Math.min(screen.width, screen.height)
      : Math.max(screen.width, screen.height);

    let manca = Math.max(0, Math.round(schermo - sonda.getBoundingClientRect().height));
    // una barra di stato non è mai più alta di così: una differenza più
    // grande vuol dire un'altra cosa, e allungare la pagina farebbe danni
    if (manca > 80) manca = 0;

    document.documentElement.style.setProperty('--sotto', `${manca}px`);
  };

  aggiorna();
  window.addEventListener('resize', aggiorna);
}
