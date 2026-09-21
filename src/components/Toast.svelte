<script lang="ts">
  import { toast } from '../lib/toast.svelte';
  import Icon from './Icon.svelte';
</script>

{#if toast.open}
  {#key toast.nonce}
    <div id="toast">
      <span>{toast.message}</span>
      {#if toast.action}
        <button
          type="button"
          class="toast-action"
          onclick={() => {
            const action = toast.action;
            toast.hide();
            action?.run();
          }}
        >
          <Icon name="undo" />
          {toast.action.label}
        </button>
      {/if}
    </div>
  {/key}
{/if}
