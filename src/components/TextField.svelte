<script lang="ts">
  /**
   * Un campo di testo, scritto una volta sola.
   *
   * Il vestito stava già nel foglio dei controlli — tutti gli `input`
   * dell'app hanno lo stesso fondo e lo stesso bordo — ma tutto il resto no:
   * ogni posto si rifaceva la misura, il tipo, il modo di leggere quello che
   * si scrive, e i due o tre accorgimenti che servono perché il gestore di
   * password del browser non si metta a riempire campi che non sono
   * password. Dieci copie di quella roba divergono, e infatti divergevano.
   *
   * Le varianti sono quelle che l'app usa davvero: testo, posta, password,
   * ricerca. Non una in più — un componente con dieci vestiti è un foglio di
   * stile con un nome diverso.
   */
  type Kind = 'text' | 'email' | 'password' | 'search';

  let {
    value = $bindable(''),
    onchange,
    oninput,
    kind = 'text',
    size,
    placeholder,
    label,
    maxlength = 140,
    autocomplete,
    required = false,
    autofocus = false,
    /**
     * Sorda finché non la tocchi.
     *
     * Certi gestori di password riempiono qualunque campo somigli a un
     * accesso, e in mezzo a un collegamento — l'indirizzo di una telecamera,
     * il codice di un servizio — ci si ritrova l'email di qualcun altro. Un
     * campo che nasce in sola lettura non lo tenta, e al primo tocco torna
     * normale.
     */
    shy = false,
    element = $bindable(),
    ...rest
  }: {
    value?: string;
    /** Quando si è finito di scrivere: l'invio, o il dito altrove. */
    onchange?: (next: string) => void;
    /** Mentre si scrive, per chi deve rispondere a ogni lettera (la ricerca). */
    oninput?: (next: string) => void;
    kind?: Kind;
    /** `sm`: alto quanto una pastiglia, per stare in fila con le altre cose. */
    size?: 'sm';
    placeholder?: string;
    /** Come si chiama questo campo, per chi non lo vede. */
    label?: string;
    maxlength?: number;
    autocomplete?: AutoFill;
    required?: boolean;
    autofocus?: boolean;
    shy?: boolean;
    /** Per chi deve metterci il fuoco da fuori. */
    element?: HTMLInputElement;
    [key: string]: unknown;
  } = $props();

  let touched = $state(false);
</script>

<!-- svelte-ignore a11y_autofocus -->
<input
  type={kind}
  class="text-field"
  class:is-sm={size === 'sm'}
  bind:this={element}
  bind:value
  {placeholder}
  {maxlength}
  {required}
  {autofocus}
  autocomplete={autocomplete ?? (kind === 'search' ? ('off' as AutoFill) : undefined)}
  readonly={shy && !touched}
  aria-label={label}
  onfocus={() => (touched = true)}
  oninput={(event) => oninput?.(event.currentTarget.value)}
  onchange={(event) => onchange?.(event.currentTarget.value)}
  onkeydown={(event) => {
    // l'invio vale come «ho finito», dove non c'è un modulo che lo prende
    if (event.key === 'Enter' && onchange && !event.currentTarget.form) event.currentTarget.blur();
  }}
  data-lpignore={shy ? 'true' : undefined}
  data-1p-ignore={shy ? 'true' : undefined}
  {...rest}
/>

<style>
  /* la misura corta: la stessa di una pastiglia e dei campi dell'orario,
     perche' sulla stessa riga due altezze diverse si vedono subito */
  .text-field.is-sm {
    height: 26px;
    padding: 0 9px;
    border-radius: var(--r-sm);
    font-size: 11.5px;
  }
</style>
