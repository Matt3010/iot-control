const GAP = 10;

export interface Position {
  left: number;
  top: number;
}

/**
 * Popovers open beside their sheet when there is room, so the form underneath
 * stays readable, and fall back to above/below the button when there is not.
 */
export function placeBeside(anchor: HTMLElement, width: number, height: number): Position {
  const rect = anchor.getBoundingClientRect();
  const sheet = anchor.closest('aside')?.getBoundingClientRect();

  const beside = sheet && sheet.left - width - GAP > 8 ? sheet.left - width - GAP : null;
  const left = beside ?? Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const below = rect.bottom + height + GAP < window.innerHeight;
  const top = Math.min(
    Math.max(8, beside ? rect.top - 8 : below ? rect.bottom + GAP : rect.top - height - GAP),
    window.innerHeight - height - 8,
  );
  return { left, top };
}
