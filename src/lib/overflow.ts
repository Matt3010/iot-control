/**
 * Marks a scroller with where its content continues, so the CSS can fade that
 * edge. A row cut in half reads as a mistake, a fade reads as "there is more".
 *
 * Funziona per lungo e per largo, e decide da sè quale dei due guardando
 * dove il contenuto esce davvero. Le strisce di pastiglie scorrono di lato e
 * gli elenchi in giù, ma il segno che dice «ce n'è ancora» è lo stesso, e
 * una seconda copia di questo pezzo con dentro «sinistra» al posto di
 * «sopra» sarebbe stata la stessa idea scritta due volte.
 */
export function fadeEdges(node: HTMLElement) {
  const update = () => {
    const sideways = node.scrollWidth - node.clientWidth > 2;
    const at = sideways ? node.scrollLeft : node.scrollTop;
    const span = sideways
      ? node.scrollWidth - node.clientWidth
      : node.scrollHeight - node.clientHeight;
    const atStart = at <= 2;
    const atEnd = span - at <= 2;

    node.dataset.fade =
      atStart && atEnd
        ? 'none'
        : atStart
          ? sideways ? 'right' : 'bottom'
          : atEnd
            ? sideways ? 'left' : 'top'
            : 'both';
  };

  /**
   * E con la rotella si scorre lo stesso.
   *
   * Una rotella va solo in su e in giù, e una striscia che scorre di lato
   * resterebbe ferma sotto al mouse: col dito la si spinge, ma chi ha un
   * mouse dovrebbe sapere di dover tenere premuto un tasto per vedere le
   * pastiglie che restano fuori. Qui il gesto più ovvio fa la cosa ovvia.
   */
  const wheel = (event: WheelEvent) => {
    const sideways = node.scrollWidth - node.clientWidth > 2;
    if (!sideways || event.deltaY === 0 || event.ctrlKey) return;
    // chi ha già un gesto orizzontale — un trackpad — se lo tiene
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    node.scrollLeft += event.deltaY;
    event.preventDefault();
  };

  update();
  node.addEventListener('scroll', update, { passive: true });
  node.addEventListener('wheel', wheel);
  const observer = new ResizeObserver(update);
  observer.observe(node);
  for (const child of node.children) observer.observe(child);

  return {
    update,
    destroy() {
      node.removeEventListener('scroll', update);
      node.removeEventListener('wheel', wheel);
      observer.disconnect();
    },
  };
}
