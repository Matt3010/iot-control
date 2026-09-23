<script lang="ts">
  /**
   * Una riga di testo, scritta una volta sola.
   *
   * Il vestito di un campo sta già nel foglio dei controlli, ma la misura no:
   * ogni posto che ne voleva uno più piccolo se lo rimpiccioliva da sé, e
   * accanto a una pastiglia veniva sempre di un'altezza diversa. Qui le
   * misure sono due — quella normale e quella corta — e la corta è alta
   * quanto una pastiglia, perché stanno sulla stessa riga.
   *
   * Non tiene lo stato: il valore arriva da fuori e torna fuori appena si
   * finisce di scrivere. Una scena che si salva a ogni lettera battuta
   * manderebbe venti richieste per venti caratteri.
   */
  let {
    value,
    onchange,
    placeholder,
    label,
    size,
    maxlength = 140,
    ...rest
  }: {
    value: string;
    /** Quando si è finito di scrivere: l'invio, o il dito altrove. */
    onchange: (next: string) => void;
    placeholder?: string;
    /** Come si chiama questo campo, per chi non lo vede. */
    label?: string;
    /** `sm`: alta quanto una pastiglia, per stare in fila con le altre cose. */
    size?: 'sm';
    maxlength?: number;
    [key: string]: unknown;
  } = $props();
</script>

<input
  type="text"
  class="text-field"
  class:is-sm={size === 'sm'}
  {value}
  {placeholder}
  {maxlength}
  aria-label={label}
  onchange={(event) => onchange(event.currentTarget.value)}
  onkeydown={(event) => {
    // l'invio vale come «ho finito»: il campo lascia il fuoco e il valore parte
    if (event.key === 'Enter') event.currentTarget.blur();
  }}
  {...rest}
/>

<style>
  /* la misura corta: la stessa di una pastiglia e dei due campi dell'orario,
     perche' sulla stessa riga due altezze diverse si vedono subito */
  .text-field.is-sm {
    height: 26px;
    padding: 0 9px;
    border-radius: var(--r-sm);
    font-size: 11.5px;
  }
</style>
