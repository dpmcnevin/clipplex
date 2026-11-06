<script>
  import { browser } from "$app/environment";
  import { invalidateAll } from "$app/navigation";
  import ClipCard from "$lib/components/ClipCard.svelte";
  import FileBrowser from "$lib/components/FileBrowser.svelte";
  import NowPlaying from "$lib/components/NowPlaying.svelte";
  import PlexSearch from "$lib/components/PlexSearch.svelte";
  import Scrubber from "$lib/components/Scrubber.svelte";
  import TimeRange from "$lib/components/TimeRange.svelte";
  import { streamJob } from "$lib/ndjson.js";
  import { hideOverlay, overlay, setProgress, showOverlay, showToast } from "$lib/stores.svelte.js";

  let { data } = $props();

  let source = $state(data.hasPlex ? "plex" : "file");
  let username = $state(data.defaultUsername);
  let selected = $state(null);
  let startParts = $state(["", "", ""]);
  let endParts = $state(["", "", ""]);
  let alsoGif = $state(false);
  let previewUrl = $state("");
  let previewKey = $state("");
  let justCreated = $state("");

  // Streamable shortcodes are not stored server-side, so keep them here or a
  // reload loses the share URL for good.
  const SHARE_KEY = "clipplex_shares";
  let shares = $state({});

  if (browser) {
    try {
      shares = JSON.parse(localStorage.getItem(SHARE_KEY)) || {};
    } catch {
      shares = {};
    }
  }

  function rememberShare(filePath, url) {
    shares = { ...shares, [filePath]: url };
    try {
      localStorage.setItem(SHARE_KEY, JSON.stringify(shares));
    } catch {
      // Private mode: the link still shows until the page is reloaded.
    }
  }

  const joined = (parts) =>
    parts.every((part) => part !== "") ? parts.map((p) => p.padStart(2, "0")).join(":") : "";

  const startTime = $derived(joined(startParts));
  const endTime = $derived(joined(endParts));

  // A preview belongs to one exact range; changing anything retires it
  // rather than leaving a stale clip on screen.
  const rangeKey = $derived(`${selected?.path ?? source}|${startTime}|${endTime}`);

  function pickSource(kind) {
    source = kind;
    if (kind === "plex") selected = null;
  }

  function useStartTime(time) {
    startParts = time.split(":");
  }

  function addToEnd(seconds) {
    if (!startTime) {
      showToast("Set a start time first.", "error");
      return;
    }
    const [h, m, s] = startTime.split(":").map(Number);
    const total = h * 3600 + m * 60 + s + seconds;
    endParts = [
      Math.floor(total / 3600),
      Math.floor((total % 3600) / 60),
      total % 60
    ].map((part) => String(part).padStart(2, "0"));
  }

  function buildParams() {
    if (!startTime || !endTime) {
      showToast("Fill in both times.", "error");
      return null;
    }
    const params = new URLSearchParams({ source, start: startTime, end: endTime });
    if (source === "plex") {
      if (!username.trim()) {
        showToast("Enter a Plex username first.", "error");
        return null;
      }
      params.set("username", username);
    } else if (source === "item") {
      if (!selected?.ratingKey) {
        showToast("Pick something from the search results.", "error");
        return null;
      }
      params.set("rating_key", selected.ratingKey);
    } else {
      if (!selected?.path) {
        showToast("Pick a file to clip from.", "error");
        return null;
      }
      params.set("path", selected.path);
    }
    return params;
  }

  async function previewRange() {
    const params = buildParams();
    if (!params) return;
    const key = rangeKey;

    showOverlay("Rendering preview…");
    try {
      const result = await streamJob(`/api/preview?${params}`, (update) =>
        setProgress(update.stage, update.progress)
      );
      hideOverlay();
      previewUrl = `/media/${result.previewPath}`;
      previewKey = key;
    } catch (error) {
      hideOverlay();
      showToast(`Preview failed: ${error.message}`, "error", { sticky: true });
    }
  }

  async function createClip() {
    const params = buildParams();
    if (!params) return;
    if (alsoGif) params.set("gif", "1");

    showOverlay("Creating clip…");
    try {
      const result = await streamJob(`/api/clips?${params}`, (update) => {
        setProgress(update.stage, update.progress);
        overlay.text = update.stage === "gif" ? "Rendering GIF…" : "Creating clip…";
      });
      hideOverlay();
      previewUrl = "";
      await invalidateAll();
      justCreated = result.filePath ?? "";
      showToast(alsoGif ? "Clip and GIF created." : "Clip created.", "ok");
      setTimeout(() => (justCreated = ""), 6000);
    } catch (error) {
      hideOverlay();
      showToast(`Clip creation failed: ${error.message}`, "error", { sticky: true });
    }
  }

  async function makeGif(clip) {
    showOverlay("Rendering GIF…");
    try {
      const response = await fetch(
        `/api/clips/gif?file_path=${encodeURIComponent(clip.filePath)}`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
      hideOverlay();
      await invalidateAll();
      showToast("GIF ready.", "ok");
    } catch (error) {
      hideOverlay();
      showToast(`GIF failed: ${error.message}`, "error", { sticky: true });
    }
  }

  async function removeClip(clip) {
    if (!confirm("Delete this clip? This cannot be undone.")) return;
    showOverlay("Deleting…");
    try {
      const response = await fetch(
        `/api/clips/delete?file_path=${encodeURIComponent(clip.filePath)}`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
      hideOverlay();
      await invalidateAll();
      showToast("Clip deleted.", "ok");
    } catch (error) {
      hideOverlay();
      showToast(`Could not delete the clip: ${error.message}`, "error");
    }
  }

  async function share(clip) {
    showOverlay("Uploading to Streamable…");
    try {
      const response = await fetch(
        `/api/streamable?file_path=${encodeURIComponent(clip.filePath)}`,
        { method: "POST" }
      );
      const result = await response.json();
      hideOverlay();
      if (response.ok && result.shortcode) {
        const url = `https://streamable.com/${result.shortcode}`;
        rememberShare(clip.filePath, url);
        showToast("Uploaded to ", "ok", { link: url, sticky: true });
        copy(url);
      } else {
        showToast(`Streamable: ${result.message || "upload failed"}`, "error", { sticky: true });
      }
    } catch (error) {
      hideOverlay();
      showToast(`Streamable upload failed: ${error.message}`, "error", { sticky: true });
    }
  }

  function copy(url) {
    navigator.clipboard
      ?.writeText(url)
      .then(() => showToast("Link copied.", "ok"))
      .catch(() => showToast("Copy failed — the link is on the card.", "error"));
  }
</script>

<svelte:head><title>Clips · Clipplex</title></svelte:head>

<h1>Clips</h1>

<div class="workspace">
  <section class="card">
    <h2>Source</h2>

    <div class="tabs">
      {#if data.hasPlex}
        <button type="button" class="tab" class:active={source === "plex"} onclick={() => pickSource("plex")}>
          <i class="fas fa-play-circle"></i> Now playing
        </button>
        <button type="button" class="tab" class:active={source === "item"} onclick={() => pickSource("item")}>
          <i class="fas fa-search"></i> Search
        </button>
      {/if}
      <button type="button" class="tab" class:active={source === "file"} onclick={() => pickSource("file")}>
        <i class="fas fa-folder-open"></i> Files
      </button>
    </div>

    {#if source === "plex"}
      <NowPlaying bind:username onUseTime={useStartTime} onPick={(pick) => (selected = pick)} />
    {:else if source === "item"}
      <PlexSearch onPick={(pick) => (selected = pick)} />
    {:else}
      <FileBrowser onPick={(pick) => (selected = pick)} />
    {/if}
  </section>

  <section class="card">
    <h2>Trim</h2>

    {#if selected}
      <div class="selected">
        <i class="fas fa-film"></i>
        <span style="flex:1; min-width:0;">{selected.label}</span>
        <span class="clip-sub">{selected.meta}</span>
      </div>
    {/if}

    {#if selected?.path && selected?.duration}
      <Scrubber path={selected.path} duration={selected.duration} bind:startParts bind:endParts />
    {:else}
      <div class="placeholder">
        <i class="fas fa-crop-alt"></i>
        <span>Pick something on the left and its frames appear here to scrub through.</span>
      </div>
    {/if}

    <div class="trim-divider"></div>

    <div class="times">
      <TimeRange label="Start" bind:parts={startParts} />
      <TimeRange label="End" bind:parts={endParts}>
        <div class="chips">
          {#each [[15, "+15s"], [30, "+30s"], [60, "+1m"], [120, "+2m"]] as [seconds, label]}
            <button type="button" class="chip" onclick={() => addToEnd(seconds)}>{label}</button>
          {/each}
        </div>
      </TimeRange>
    </div>

    {#if previewUrl && previewKey === rangeKey}
      <div class="trim-divider"></div>
      <div class="preview-box">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={previewUrl} controls autoplay></video>
        <div class="preview-note">
          Draft at 480p, {startTime} to {endTime}. Create the clip for full quality.
        </div>
      </div>
    {/if}

    <div class="trim-divider"></div>

    <div class="actions">
      <label class="checkbox">
        <input type="checkbox" bind:checked={alsoGif} /> Also make a GIF
      </label>
      <span style="flex:1"></span>
      <button type="button" class="btn btn--ghost" onclick={previewRange}>
        <i class="fas fa-play"></i> Preview range
      </button>
      <button type="button" class="btn btn--primary" onclick={createClip}>
        <i class="fas fa-hand-scissors"></i> Create clip
      </button>
    </div>
  </section>
</div>

<div class="section-head">
  <h2>Library</h2>
  {#if data.clips.length}<span class="count-pill">{data.clips.length}</span>{/if}
</div>

{#if data.clips.length}
  <div class="clips">
    {#each data.clips as clip (clip.filePath)}
      <ClipCard
        {clip}
        shareUrl={shares[clip.filePath] ?? ""}
        isNew={clip.filePath === justCreated}
        onDelete={removeClip}
        onGif={makeGif}
        onShare={share}
        onCopy={copy}
      />
    {/each}
  </div>
{:else}
  <div class="empty">
    <i class="fas fa-film"></i>
    No clips yet. Choose a source, set a range, and create one.
  </div>
{/if}
