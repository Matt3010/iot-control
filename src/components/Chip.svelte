<script lang="ts">
  import type { Salute } from '../lib/health';
  import HealthDot from './HealthDot.svelte';
  import Mark from './Mark.svelte';
  type Look = 'on' | 'off' | 'sel';

  let {
    color,
    emoji,
    label,
    count,
    salute,
    look = 'on',
    size,
    disabled = false,
    onclick,
    ...rest
  }: {
    color?: string;
    emoji?: string;
    label: string;
    count?: number;
    /** Per un dispositivo, se risponde: il pallino davanti al nome. */
    salute?: Salute;
    look?: Look;
    /** Più piccola del normale: dentro a una card, in mezzo ad altri controlli. */
    size?: 'sm';
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    /* quello che non sappiamo ancora di dover passare: title, aria, dati */
    [key: string]: unknown;
  } = $props();
</script>

<button
  type="button"
  class="chip {look} {size === 'sm' ? 'is-sm' : ''}"
  style:--c={color}
  {disabled}
  {onclick}
  {...rest}
>
  {#if emoji}<span class="emo"><Mark value={emoji} size={14} /></span>{/if}
  {#if salute}<HealthDot {salute} />{/if}
  <span class="name">{label}</span>
  {#if count !== undefined}<span class="count">{count}</span>{/if}
</button>

<style>
/* spento vuol dire spento: niente clic e niente passaggio col tasto tab */
.chip:disabled { opacity: 0.45; pointer-events: none; }

/* chips ------------------------------------------------------------------- */

.chip {
  --c: var(--ink-2);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px 0 9px;
  border: 1px solid var(--hairline);
  border-radius: 99px;
  background: transparent;
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  user-select: none;
  transition: background 0.16s, border-color 0.16s, color 0.16s, opacity 0.16s, transform 0.14s var(--ease);
}

.chip:hover { transform: translateY(-1px); }

/* Dove si tocca, una pastiglia è alta quanto un dito. Trenta pixel bastano a
   un puntatore che arriva preciso; un polpastrello ne copre quaranta, e fra
   due filtri vicini prende quello sbagliato. */
/* La misura piccola. Sta qui e non in chi la ospita, se no ogni schermata si
   inventa la sua e poi divergono di un pixel per volta. */
.chip.is-sm { height: 26px; padding: 0 10px 0 9px; font-size: 11.5px; }

/* Dove si tocca, anche la piccola è alta quanto un dito. Scritta dopo e non
   prima: stava sopra alla misura piccola, che a parità di peso vinceva lei,
   e «Apri, Ferma, Chiudi» di una tenda restavano alti ventisei pixel. */
@media (hover: none) {
  .chip { height: 40px; }
  .chip.is-sm { height: 36px; }
}

/* il segno dentro alla pillola: un disegno prende il colore del testo, e
   un'emoji di quelle vecchie si porta ancora i suoi */
.chip .emo { display: inline-grid; place-items: center; line-height: 1; }

.chip .count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
}

.chip.on {
  background: color-mix(in srgb, var(--c) 13%, transparent);
  border-color: color-mix(in srgb, var(--c) 38%, transparent);
  color: var(--ink);
}

.chip.on .count { color: color-mix(in srgb, var(--c) 65%, var(--ink-2)); }

/* a scope chip is picked, not toggled: unpicked stays legible */
.chip.sel {
  background: color-mix(in srgb, var(--ink) 9%, transparent);
  border-color: color-mix(in srgb, var(--ink) 26%, transparent);
  color: var(--ink);
  font-weight: 540;
}

.chip.off { opacity: 0.55; }

.chip.off .emo { filter: grayscale(1); }

</style>
