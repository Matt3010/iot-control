<script lang="ts">
  /**
   * Un interruttore solo per tutta l'app. Con la nota sotto il nome resta
   * sempre acceso di colore; da solo, il nome segue lo stato.
   */
  let {
    checked,
    onchange,
    label,
    note,
    title,
    disabled = false,
    ...rest
  }: {
    checked: boolean;
    onchange: (value: boolean) => void;
    label: string;
    note?: string;
    title?: string;
    disabled?: boolean;
    [key: string]: unknown;
  } = $props();
</script>

<label class="switch" class:is-on={checked} class:has-note={!!note} class:is-off={disabled} {title}>
  <input
    type="checkbox"
    {checked}
    {disabled}
    onchange={(event) => onchange(event.currentTarget.checked)}
    {...rest}
  />
  <span class="switch-track"><span class="switch-dot"></span></span>
  <span class="switch-text">
    <span class="switch-name">{label}</span>
    {#if note}<span class="switch-note">{note}</span>{/if}
  </span>
</label>

<style>
  /* spento: si vede e non si tocca */
  .switch.is-off { opacity: 0.5; cursor: default; pointer-events: none; }

  .switch {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .switch-track {
    position: relative;
    flex: none;
    width: 38px;
    height: 22px;
    border-radius: 99px;
    background: var(--sunken-hover);
    box-shadow: inset 0 0 0 1px var(--hairline);
    transition: background 0.18s;
  }

  .switch-dot {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--glass-strong);
    box-shadow: var(--shadow-1);
    transition: transform 0.18s var(--ease);
  }

  .switch input:checked + .switch-track { background: var(--accent); }
  .switch input:checked + .switch-track .switch-dot { transform: translateX(16px); }
  .switch input:focus-visible + .switch-track { outline: 2px solid var(--accent); outline-offset: 2px; }

  .switch-text { display: grid; gap: 1px; }

  .switch-name {
    font-size: 13px;
    font-weight: 540;
    color: var(--ink-3);
    transition: color 0.16s;
  }

  /* con la spiegazione sotto, il nome è un titolo: non si spegne */
  .switch.has-note .switch-name, .switch.is-on .switch-name { color: var(--ink); }

  .switch:not(.has-note) .switch-name { font-size: 12.5px; }

  .switch-note { font-size: 11.5px; line-height: 1.4; color: var(--ink-3); }
</style>
