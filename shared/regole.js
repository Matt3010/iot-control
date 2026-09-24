/*
 * Le tabelle e le regole piccole che il server e il sito devono dire allo
 * stesso modo.
 *
 * Stavano scritte due volte, una per parte, e alla prima correzione hanno
 * cominciato a dire cose diverse: il colore a 340 era «rosa» sul sito e
 * «rosso» nel registro. Qui c'è una copia sola.
 *
 * È JavaScript scritto a mano, con i tipi accanto in `regole.d.ts`, e non
 * TypeScript: così lo esegue il server così com'è, da `src` e da `dist`
 * (stanno alla stessa profondità), e lo impacchetta il sito senza che
 * nessuno dei due debba compilarlo per l'altro.
 */

/**
 * Le parole di stato di quel valore, se la capacità ne ha: una serratura si
 * comanda con «Apri» e con lo stesso valore dice com'è rimasta, e letta come
 * un ordine una prova sembrerebbe chiederle di aprirsi. Le parole le dà
 * l'agente (`detti` nel protocollo), `se` per com'è e `quando` per quello
 * che succede.
 */
export function statoDi(capability, value) {
  return capability.kind === 'enum' ? capability.detti?.[String(value)] : undefined;
}

/**
 * Una telecamera: non si comanda, si guarda. È quello che a un ospite non si
 * mostra, né nell'elenco né sul filo.
 */
export function siGuarda(capabilities) {
  return capabilities.some((one) => one.kind === 'image');
}

/**
 * Quello che si comanda e basta, senza sapere com'è rimasto.
 *
 * Il movimento di una tenda è l'ultimo ordine dato da qui, e se la si apre
 * dal pulsante a muro nessuno lo racconta. Una prova scritta su quello
 * direbbe «chiuso» a finestre aperte, e una su «Ferma» non scatterebbe mai.
 * Lo dice l'agente, che sa quale capacità è un ordine (`order` nel
 * protocollo): qui non si tiene un elenco di nomi.
 */
export function soloOrdine(capability) {
  return capability.kind === 'enum' && capability.order === true;
}

/**
 * Il codice di una capacità che passa da un dispositivo a quello che lo tiene
 * dentro: davanti ci va l'entità da cui viene. Un codice che ne ha già una
 * resta com'è, perché `a#b#power` non saprebbe più nessuno a chi mandarlo.
 * La stessa regola per le scene e per gli avvisi, che prima la scrivevano
 * una in TypeScript e l'altra in SQL.
 */
export function conEntita(code, entita) {
  return code.includes('#') ? code : `${entita}#${code}`;
}

/**
 * Perché su questa capacità non si può scrivere una prova, o `null` se si
 * può. `quando` è una cosa che succede, `se` una cosa che è vera adesso.
 *
 * Una risposta sola per il sito, che non mostra quello che non si può
 * scegliere, e per il server, che lo rifiuta e dice perché: prima erano due
 * elenchi, e il server lasciava passare una telecamera che il sito non
 * mostrava.
 */
export function nonProvabile(capability, modo) {
  // una telecamera si guarda e basta
  if (capability.kind === 'image') return 'immagine';
  // un colore non si chiede: rosso e viola stanno ai due capi del cerchio e sono quasi lo stesso
  if (capability.kind === 'color') return 'colore';
  // un'impostazione si cambia, ma non è una cosa che succede in casa
  if (capability.setting) return 'impostazione';
  // un evento succede e basta: non c'è un «com'è» da chiedere in un «solo se»
  if (modo === 'se' && capability.kind === 'sensor' && capability.event) return 'evento';
  // a impulso torna spento subito, e com'è rimasto quello che comanda non si sa
  if (modo === 'se' && capability.kind === 'switch' && capability.pulse) return 'impulso';
  // si sa solo l'ultimo ordine dato, non com'è adesso
  if (soloOrdine(capability)) return 'ordine';
  return null;
}

/**
 * Se si chiede con un numero, «sopra 25», o con una parola. Un sensore che
 * dichiara le sue parole (una porta, un movimento) è una parola, anche se è
 * un sensore.
 */
export function siMisura(capability) {
  return capability.kind === 'range' || (capability.kind === 'sensor' && !capability.values?.length);
}

/** Un numero come si legge in Italia: la virgola, e l'unità dopo uno spazio. */
export function numero(value, unit) {
  const n = Number(value);
  const scritto = Number.isFinite(n) ? n.toLocaleString('it', { maximumFractionDigits: 1 }) : String(value);
  return unit ? `${scritto} ${unit}` : scritto;
}

/**
 * I colori con un nome. Una tinta è un numero sul cerchio, da 0 a 360, e
 * «imposta il colore a 230» non lo legge nessuno: in una scena si sceglie
 * per nome, e un numero qualunque si dice con il nome più vicino.
 */
export const COLORI = [
  { tinta: 0, nome: 'Rosso' },
  { tinta: 30, nome: 'Arancione' },
  { tinta: 55, nome: 'Giallo' },
  { tinta: 120, nome: 'Verde' },
  { tinta: 190, nome: 'Azzurro' },
  { tinta: 230, nome: 'Blu' },
  { tinta: 280, nome: 'Viola' },
  { tinta: 320, nome: 'Rosa' },
];

/** Il nome del colore più vicino a quella tinta. Il rosso sta a tutti e due i capi del cerchio. */
export function nomeColore(tinta) {
  const giro = ((tinta % 360) + 360) % 360;
  const distanza = (a) => Math.min(Math.abs(a - giro), 360 - Math.abs(a - giro));
  return COLORI.reduce((meglio, uno) => (distanza(uno.tinta) < distanza(meglio.tinta) ? uno : meglio)).nome;
}

/**
 * Lo stesso albero di condizioni senza quelle che non vanno più bene. I
 * gruppi rimasti vuoti se ne vanno con loro, tranne quello più esterno.
 */
export function senza(gruppo, via) {
  const pota = (one) => {
    if (one.kind !== 'group') return via(one) ? null : one;
    const items = one.items.map(pota).filter((x) => x !== null);
    return items.length ? { ...one, items } : null;
  };
  return { ...gruppo, items: gruppo.items.map(pota).filter((x) => x !== null) };
}
