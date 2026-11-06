<script>
  import { showToast } from "$lib/stores.svelte.js";

  let { username = $bindable(""), onUseTime, onPick } = $props();

  let state = $state({ shown: false, error: false, title: "", time: "" });

  async function check() {
    if (!username.trim()) {
      showToast("Enter a Plex username first.", "error");
      return;
    }
    try {
      const response = await fetch(`/api/stream?username=${encodeURIComponent(username)}`);
      const data = await response.json();
      if (data.message) {
        state = { shown: true, error: true, title: data.message, time: "" };
        onPick(null);
        return;
      }
      const label = data.show ? `${data.show} — ${data.title}` : data.title;
      state = { shown: true, error: false, title: label, time: data.currentTime };
      onPick({
        label,
        meta: data.durationStr,
        path: data.path,
        duration: data.reachable ? data.duration : 0
      });
    } catch (error) {
      showToast(`Could not reach the server: ${error.message}`, "error");
    }
  }
</script>

<div class="field">
  <label for="plex-user">Plex user</label>
  <input id="plex-user" type="text" size="18" bind:value={username} />
  <button type="button" class="btn btn--ghost" onclick={check}>
    <i class="fas fa-eye"></i> Check stream
  </button>
</div>

{#if state.shown}
  <div class="nowplaying" data-state="shown" class:nowplaying--error={state.error}>
    <div style="flex:1; min-width:0;">
      <div class="np-title">{state.title}</div>
      {#if state.time}
        <div class="np-meta">Playing at <span class="np-time">{state.time}</span></div>
      {/if}
    </div>
    {#if state.time}
      <button type="button" class="chip" onclick={() => onUseTime(state.time)}>Use as start</button>
    {/if}
  </div>
{/if}
