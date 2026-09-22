import type L from 'leaflet';

/**
 * Far scendere il fumetto di un luogo sotto al pannello.
 *
 * La mappa sa tenere un fumetto dentro al suo riquadro, e lo fa: quando si
 * apre vicino a un bordo, sposta la vista quanto basta. Ma del pannello che
 * le galleggia sopra non sa niente — per lei quello spazio è libero — e su un
 * telefono, dove il pannello prende tutta la larghezza e mezza altezza, il
 * fumetto ci finisce sotto e ne resta fuori la coda: proprio la riga con le
 * cose da premere.
 *
 * Alzargli il piano di sopra sarebbe stata la riga più corta, e la risposta
 * sbagliata: un fumetto disegnato sopra alla ricerca e ai filtri sembra una
 * cosa rotta. Invece si scosta la mappa, che è quello che la mappa fa già da
 * sé contro i suoi bordi: qui si aggiunge solo un bordo che lei non vede.
 */
export function clearOf(map: L.Map, hidden: () => Element | null | undefined): () => void {
  const nudge = (event: L.PopupEvent): void => {
    const shown = event.popup.getElement();
    const over = hidden()?.getBoundingClientRect();
    if (!shown || !over) return;

    const box = shown.getBoundingClientRect();
    // Se non si accavallano in larghezza non c'è niente da spostare: su uno
    // schermo largo il pannello sta da una parte e il fumetto dall'altra.
    if (box.left >= over.right || box.right <= over.left) return;

    const serve = over.bottom + 12 - box.top;
    if (serve > 0) map.panBy([0, -serve], { animate: true });
  };

  map.on('popupopen', nudge);
  return () => map.off('popupopen', nudge);
}
