import type { NextFunction, Request, Response } from 'express';

/**
 * Le intestazioni che dicono al browser cosa questa pagina può fare, e
 * cosa no.
 *
 * Esistono perché senza, la pagina si poteva incorniciare dentro a un sito
 * qualunque e farsi premere i tasti a occhi chiusi, e uno script arrivato da
 * chissà dove avrebbe avuto le stesse porte aperte del nostro. Qui c'è
 * l'elenco di quello che il sito usa davvero, e nient'altro.
 *
 * - script e stili solo da qui: il sito costruito da Vite non ha script
 *   scritti nella pagina, e i suoi fogli di stile sono file. Gli stili
 *   scritti dentro agli elementi invece restano permessi: li mettono il
 *   segno dei luoghi sulla mappa e Leaflet, che disegna le sue cose così;
 * - le immagini da qui, dalle tile di OpenStreetMap, e quelle fatte nel
 *   browser (`data:` e `blob:`, i fotogrammi delle telecamere);
 * - le domande da qui e dalla ricerca dei luoghi di OpenStreetMap;
 * - i caratteri sono file nostri, e il service worker pure;
 * - nessuno può mettere il sito dentro a una cornice (`frame-ancestors`).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self' https://nominatim.openstreetmap.org",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function intestazioni(req: Request, res: Response, next: NextFunction): void {
  res.set({
    'Content-Security-Policy': CSP,
    // un file è quello che dice di essere: un testo non si esegue come uno script
    'X-Content-Type-Options': 'nosniff',
    // a OpenStreetMap basta sapere da che sito arriva la richiesta, non da quale pagina
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // per i browser che `frame-ancestors` non lo leggono ancora
    'X-Frame-Options': 'DENY',
  });
  /*
   * «Da qui in poi solo https» lo si dice solo quando la richiesta è
   * arrivata in https: detto a un sito provato in chiaro sulla rete di
   * casa, il browser non lo aprirebbe più per un anno.
   */
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}
