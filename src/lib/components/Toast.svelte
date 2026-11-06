<script>
  import { toast, hideToast } from "$lib/stores.svelte.js";
</script>

{#if toast.open}
  <div class="toast {toast.kind ? `toast--${toast.kind}` : ''}" role="status" aria-live="polite">
    <div class="toast-body">
      {toast.message}
      {#if toast.link}
        <a href={toast.link} target="_blank" rel="noopener">{toast.link}</a>
      {/if}
    </div>
    <button type="button" class="toast-close" aria-label="Dismiss" onclick={hideToast}>
      <i class="fas fa-times"></i>
    </button>
  </div>
{/if}
