<script lang="ts">
  type Look = 'on' | 'off' | 'sel';

  let {
    color,
    emoji,
    label,
    count,
    look = 'on',
    onclick,
  }: {
    color?: string;
    emoji?: string;
    label: string;
    count?: number;
    look?: Look;
    onclick?: () => void;
  } = $props();
</script>

<button type="button" class="chip {look}" style:--c={color} {onclick}>
  {#if emoji}<span class="emo">{emoji}</span>{/if}
  <span class="name">{label}</span>
  {#if count !== undefined}<span class="count">{count}</span>{/if}
</button>

<style>
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

.chip .emo { font-family: var(--emoji); font-size: 13.5px; line-height: 1; }

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
