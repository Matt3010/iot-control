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
