<script>
  /**
   * Pick in and out points visually. Source media is often MKV, HEVC or
   * anything else a browser will not play, so instead of a <video> element
   * this pulls single frames from ffmpeg as you drag.
   */
  let { path, duration = 0, startParts = $bindable(), endParts = $bindable() } = $props();

  let track = $state(null);
  let dragging = $state(null);
  let active = $state("in");
  let previewSrc = $state("");
  let previewFor = $state(0);
  let initialisedFor = $state("");
  let grabOffset = 0;
  let timer = null;

  const clamp = (value) => Math.min(duration, Math.max(0, value));

  function partsToSeconds(parts) {
    if (!parts || parts.some((part) => part === "")) return null;
    const [h, m, s] = parts.map(Number);
    return h * 3600 + m * 60 + s;
  }

  function secondsToParts(total) {
    const whole = Math.round(clamp(total));
    return [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60].map((part) =>
      String(part).padStart(2, "0")
    );
  }

  const fmt = (seconds) => secondsToParts(Math.max(0, seconds)).join(":");

  const inSec = $derived(partsToSeconds(startParts) ?? 0);
  const outSec = $derived(partsToSeconds(endParts) ?? 0);
  const inPct = $derived(duration ? (inSec / duration) * 100 : 0);
  const outPct = $derived(duration ? (outSec / duration) * 100 : 0);

  // A newly picked source gets a usable default range rather than 00:00:00.
  $effect(() => {
    if (!path || !duration || path === initialisedFor) return;
    initialisedFor = path;
    const start = partsToSeconds(startParts) ?? 0;
    const end = partsToSeconds(endParts);
    startParts = secondsToParts(start);
    endParts = secondsToParts(end !== null && end > start ? end : start + 30);
    queuePreview(start, "in");
  });

  function queuePreview(seconds, which) {
    active = which;
    previewFor = seconds;
    clearTimeout(timer);
    timer = setTimeout(() => {
      previewSrc = `/api/frame?path=${encodeURIComponent(path)}&t=${Math.max(0, Math.round(seconds))}&w=480`;
    }, 120);
  }

  function timeAt(event) {
    const rect = track.getBoundingClientRect();
    if (!rect.width) return 0;
    return clamp(((event.clientX - rect.left) / rect.width) * duration);
  }

  function apply(seconds, which) {
    if (which === "in") {
      const next = Math.min(seconds, outSec - 1);
      startParts = secondsToParts(Math.max(0, next));
      queuePreview(Math.max(0, next), "in");
    } else {
      const next = Math.max(seconds, inSec + 1);
      endParts = secondsToParts(next);
      queuePreview(next, "out");
    }
  }

  /** Slide the whole selection, keeping its length. */
  function applyWindow(seconds) {
    const length = outSec - inSec;
    const nextIn = Math.min(Math.max(0, seconds - grabOffset), Math.max(0, duration - length));
    startParts = secondsToParts(nextIn);
    endParts = secondsToParts(nextIn + length);
    queuePreview(nextIn, "in");
  }

  /** Set the clip to a fixed length, nudging it back if it runs off the end. */
  function setLength(length) {
    if (!duration) return;
    const capped = Math.min(length, duration);
    const start = Math.min(inSec, Math.max(0, duration - capped));
    startParts = secondsToParts(start);
    endParts = secondsToParts(start + capped);
    queuePreview(start, "in");
  }

  function down(event) {
    if (!duration) return;
    const seconds = timeAt(event);

    // Within a few pixels of a handle, grab that handle; inside the band,
    // slide the whole thing; otherwise move whichever handle is nearer.
    // The grab zones shrink with the band, so a short clip still leaves a
    // middle to drag instead of being all handle.
    const rect = track.getBoundingClientRect();
    const bandPx = rect.width ? ((outSec - inSec) / duration) * rect.width : 0;
    // A short clip in a long file is only a few pixels wide. Trimming that by
    // dragging is hopeless anyway (the arrow keys and time fields are for
    // that), so give the whole band to the slide instead of to handle zones.
    const tolerancePx = bandPx < 16 ? 0 : Math.min(12, Math.max(4, bandPx / 3));
    const tolerance = rect.width ? (tolerancePx / rect.width) * duration : 0;

    if (Math.abs(seconds - inSec) <= tolerance) {
      dragging = "in";
    } else if (Math.abs(seconds - outSec) <= tolerance) {
      dragging = "out";
    } else if (seconds > inSec && seconds < outSec) {
      dragging = "window";
      grabOffset = seconds - inSec;
    } else {
      dragging = Math.abs(seconds - inSec) <= Math.abs(seconds - outSec) ? "in" : "out";
    }

    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured.
    }
    if (dragging === "window") applyWindow(seconds);
    else apply(seconds, dragging);
  }

  function move(event) {
    if (!dragging) return;
    if (dragging === "window") applyWindow(timeAt(event));
    else apply(timeAt(event), dragging);
  }

  function up(event) {
    if (dragging) {
      try {
        track.releasePointerCapture(event.pointerId);
      } catch {
        // Nothing captured.
      }
    }
    dragging = null;
  }

  function nudge(event, which) {
    const step = event.shiftKey ? 10 : 1;
    const current = which === "in" ? inSec : outSec;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      apply(clamp(current - step), which);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      apply(clamp(current + step), which);
    }
  }
</script>

{#if duration > 0}
  <div class="scrubber">
    <div class="scrub-preview">
      {#if previewSrc}
        <img src={previewSrc} alt="Frame at {fmt(previewFor)}" />
      {/if}
      <span class="scrub-badge">{active === "in" ? "In" : "Out"} · {fmt(previewFor)}</span>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="scrub-track"
      bind:this={track}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      <div
        class="scrub-range"
        class:grabbing={dragging === "window"}
        style="left: {inPct}%; width: {Math.max(0, outPct - inPct)}%"
      ></div>
      <button
        type="button"
        class="scrub-handle"
        class:on={active === "in"}
        style="left: {inPct}%"
        aria-label="Clip start, {fmt(inSec)}"
        onkeydown={(event) => nudge(event, "in")}
        onfocus={() => queuePreview(inSec, "in")}
      ></button>
      <button
        type="button"
        class="scrub-handle"
        class:on={active === "out"}
        style="left: {outPct}%"
        aria-label="Clip end, {fmt(outSec)}"
        onkeydown={(event) => nudge(event, "out")}
        onfocus={() => queuePreview(outSec, "out")}
      ></button>
    </div>

    <div class="scrub-meta">
      <span>In <b>{fmt(inSec)}</b></span>
      <span class="scrub-length">{fmt(Math.max(0, outSec - inSec))} long</span>
      <span>Out <b>{fmt(outSec)}</b></span>
    </div>
    <div class="scrub-presets">
      <span>Length</span>
      {#each [[5, "5s"], [10, "10s"], [15, "15s"], [30, "30s"], [60, "1m"], [120, "2m"], [300, "5m"]] as [seconds, label]}
        <button
          type="button"
          class="chip"
          class:chip--on={Math.round(outSec - inSec) === Math.min(seconds, Math.round(duration))}
          onclick={() => setLength(seconds)}
        >{label}</button>
      {/each}
    </div>

    <div class="scrub-hint">
      Drag the handles to trim, or drag the middle to move the clip without
      changing its length. Focus a handle and use ← → (hold shift for 10s).
    </div>
  </div>
{/if}
