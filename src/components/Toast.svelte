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

<style>
/* ------------------------------------------------------------------- toast */

#toast {
  position: absolute;
  left: 50%;
  /* the resting state has to centre on its own: toast-in only animates from it */
  transform: translateX(-50%);
  bottom: calc(28px + env(safe-area-inset-bottom));
  z-index: var(--z-toast);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-radius: 99px;
  background: rgb(14 17 22 / 0.88);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  color: #fff;
  font-size: 12.5px;
  box-shadow: var(--shadow-3);
  animation: toast-in 0.3s var(--ease);
}

/* room for the button, but only when there is one: otherwise the text sits off-centre */
#toast:has(.toast-action) { padding-right: 12px; }

.toast-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 0;
  border-radius: 99px;
  background: rgb(255 255 255 / 0.14);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  font-weight: 540;
  transition: background 0.15s;
}

.toast-action:hover { background: rgb(255 255 255 / 0.24); }

.toast-action :global(.ico) { width: 14px; height: 14px; }

@media (prefers-color-scheme: dark) {
  #toast { background: rgb(242 244 247 / 0.94); color: #0e1116; }

  .toast-action { background: rgb(14 17 22 / 0.1); }

  .toast-action:hover { background: rgb(14 17 22 / 0.18); }
}

@media (max-width: 600px) {
  #toast { bottom: var(--sopra-al-tasto); }

  :global(.sheet-open) #toast { bottom: calc(12px + env(safe-area-inset-bottom)); }
}
</style>
