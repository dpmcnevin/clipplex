<script>
  import { invalidateAll } from "$app/navigation";
  import { hideOverlay, showOverlay, showToast } from "$lib/stores.svelte.js";

  let { data } = $props();
  let username = $state(data.defaultUsername);

  async function capture() {
    if (!username.trim()) return showToast("Enter a Plex username first.", "error");
    showOverlay("Capturing frames…");
    try {
      const response = await fetch(`/api/snapshot?username=${encodeURIComponent(username)}`, {
        method: "POST"
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
      hideOverlay();
      showToast(`Captured ${result.frames} frames.`, "ok");
      await invalidateAll();
    } catch (error) {
      hideOverlay();
      showToast(`Snapshot failed: ${error.message}`, "error", { sticky: true });
    }
  }
</script>

<svelte:head><title>Snapshots · Clipplex</title></svelte:head>

<h1>Snapshots</h1>

<section class="card">
  <h2>New snapshot</h2>
  {#if data.hasPlex}
    <div class="field">
      <label for="snap-user">Plex user</label>
      <input id="snap-user" type="text" size="18" bind:value={username} />
      <button type="button" class="btn btn--primary" onclick={capture}>
        <i class="fas fa-camera-retro"></i> Capture frames
      </button>
    </div>
    <div class="clip-sub">Grabs one second of frames at the viewer's current position.</div>
  {:else}
    <div class="clip-sub">Snapshots need Plex: set PLEX_URL and PLEX_TOKEN.</div>
  {/if}
</section>

<div class="section-head">
  <h2>Gallery</h2>
  {#if data.images.length}<span class="count-pill">{data.images.length}</span>{/if}
</div>

{#if data.images.length}
  <div class="shots">
    {#each data.images as image (image)}
      <a href="/media/{image}" target="_blank" rel="noopener">
        <img src="/media/{image}" loading="lazy" alt="" />
      </a>
    {/each}
  </div>
{:else}
  <div class="empty">
    <i class="fas fa-camera-retro"></i>
    No snapshots yet.
  </div>
{/if}
