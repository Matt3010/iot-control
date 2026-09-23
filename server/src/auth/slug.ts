/** Un pezzo di URL: minuscolo, senza accenti, senza spazi. */
function slugify(text: string): string {
  const bare = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return bare || 'mappa';
}

/** Lo stesso nome due volte non può dare lo stesso indirizzo. */
export function uniqueSlug(wanted: string, taken: (candidate: string) => boolean): string {
  const base = slugify(wanted);
  if (!taken(base)) return base;
  for (let n = 2; n < 200; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
