/**
 * Marks a scroller with where its content continues, so the CSS can fade that
 * edge: a row cut in half reads as a mistake, a fade reads as "there is more".
 */
export function fadeEdges(node: HTMLElement) {
  const update = () => {
    const atTop = node.scrollTop <= 2;
    const atBottom = node.scrollHeight - node.clientHeight - node.scrollTop <= 2;
    node.dataset.fade = atTop && atBottom ? 'none' : atTop ? 'bottom' : atBottom ? 'top' : 'both';
  };

  update();
  node.addEventListener('scroll', update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(node);
  for (const child of node.children) observer.observe(child);

  return {
    update,
    destroy() {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    },
  };
}
