<script>
  import { overlay } from "$lib/stores.svelte.js";

  const percent = $derived(
    overlay.progress === null ? null : Math.round(overlay.progress * 100)
  );
</script>

{#if overlay.open}
  <div class="overlay">
    {#if percent === null}
      <div class="spinner"></div>
    {:else}
      <div class="progress">
        <div class="progress-bar" style="width: {percent}%"></div>
      </div>
    {/if}
    <p>
      {overlay.text}
      {#if percent !== null}
        <span class="progress-pct">{percent}%</span>
      {/if}
    </p>
  </div>
{/if}
