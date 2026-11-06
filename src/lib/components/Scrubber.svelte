<script>
  /**
   * Picking a short clip out of a long file needs two scales.
   *
   * One track spanning the whole file gives about 3.4 seconds per pixel in a
   * 90 minute movie, so a 30 second clip is a ~9px smudge with both handles
   * on top of each other. So: an overview strip for jumping anywhere, and a
   * zoomed detail track — a window around the selection — where the handles
   * have room to be placed accurately.
   *
   * Source media is often MKV or HEVC, which a browser will not play, so the
   * frames come from ffmpeg rather than a <video> element.
   */
  let {
    path,
    duration = 0,
    startParts = $bindable(),
    endParts = $bindable(),
    previewUrl = "",
    onPlay,
    onClearPreview
  } = $props();

  let detail = $state(null);
  let overview = $state(null);
  let dragging = $state(null);
  let active = $state("in");
  let previewSrc = $state("");
  let previewFor = $state(0);
  let initialisedFor = $state("");
  let winStart = $state(0);
  let grabOffset = 0;
  let timer = null;

  const clamp = (value, lo = 0, hi = duration) => Math.min(hi, Math.max(lo, value));

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
  const selLen = $derived(Math.max(1, outSec - inSec));

  // Show roughly six times the clip either side, never less than 30s and
  // never more than the file itself.
  const winLen = $derived(Math.min(duration, Math.max(selLen * 6, 30)));
  const winEnd = $derived(Math.min(duration, winStart + winLen));

  const pctOf = (seconds, from, span) => (span ? ((seconds - from) / span) * 100 : 0);
  const inPct = $derived(pctOf(inSec, winStart, winLen));
  const outPct = $derived(pctOf(outSec, winStart, winLen));
  const ovInPct = $derived(pctOf(inSec, 0, duration));
  const ovLenPct = $derived(duration ? (selLen / duration) * 100 : 0);
  const ovWinPct = $derived(pctOf(winStart, 0, duration));
  const ovWinLenPct = $derived(duration ? (winLen / duration) * 100 : 0);

  /** Keep the selection inside the zoomed window, recentring when it leaves. */
  function follow() {
    const margin = winLen * 0.1;
    if (inSec < winStart + margin || outSec > winStart + winLen - margin) {
      winStart = clamp((inSec + outSec) / 2 - winLen / 2, 0, Math.max(0, duration - winLen));
    }
  }

  // The selection can also move from outside — a dialogue search jumping to
  // a line — so keep the zoom window over it however it got there.
  $effect(() => {
    void inSec;
    void outSec;
    follow();
  });

  $effect(() => {
    if (!path || !duration || path === initialisedFor) return;
    initialisedFor = path;
    const start = partsToSeconds(startParts) ?? 0;
    const end = partsToSeconds(endParts);
    startParts = secondsToParts(start);
    endParts = secondsToParts(end !== null && end > start ? end : start + 30);
    winStart = clamp(start - 15, 0, Math.max(0, duration - winLen));
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

  const timeOn = (element, event, from, span) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width) return from;
    return clamp(from + ((event.clientX - rect.left) / rect.width) * span);
  };

  function apply(seconds, which) {
    if (which === "in") {
      const next = clamp(Math.min(seconds, outSec - 1), 0);
      startParts = secondsToParts(next);
      queuePreview(next, "in");
    } else {
      const next = clamp(Math.max(seconds, inSec + 1));
      endParts = secondsToParts(next);
      queuePreview(next, "out");
    }
    follow();
  }

  /** Slide the whole selection, keeping its length. */
  function applyWindow(seconds) {
    const length = outSec - inSec;
    const nextIn = clamp(seconds - grabOffset, 0, Math.max(0, duration - length));
    startParts = secondsToParts(nextIn);
    endParts = secondsToParts(nextIn + length);
    queuePreview(nextIn, "in");
    follow();
  }

  /** Set a fixed length, nudging it back if it runs off the end. */
  function setLength(length) {
    if (!duration) return;
    const capped = Math.min(length, duration);
    const start = Math.min(inSec, Math.max(0, duration - capped));
    startParts = secondsToParts(start);
    endParts = secondsToParts(start + capped);
    queuePreview(start, "in");
    follow();
  }

  function detailDown(event) {
    if (!duration) return;
    const seconds = timeOn(detail, event, winStart, winLen);
    const rect = detail.getBoundingClientRect();
    const bandPx = rect.width ? ((outSec - inSec) / winLen) * rect.width : 0;
    const tolerancePx = bandPx < 16 ? 0 : Math.min(14, Math.max(4, bandPx / 3));
    const tolerance = rect.width ? (tolerancePx / rect.width) * winLen : 0;

    if (Math.abs(seconds - inSec) <= tolerance) dragging = "in";
    else if (Math.abs(seconds - outSec) <= tolerance) dragging = "out";
    else if (seconds > inSec && seconds < outSec) {
      dragging = "window";
      grabOffset = seconds - inSec;
    } else {
      dragging = Math.abs(seconds - inSec) <= Math.abs(seconds - outSec) ? "in" : "out";
    }

    try {
      detail.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured.
    }
    if (dragging === "window") applyWindow(seconds);
    else apply(seconds, dragging);
  }

  function detailMove(event) {
    if (!dragging) return;
    const seconds = timeOn(detail, event, winStart, winLen);
    if (dragging === "window") applyWindow(seconds);
    else apply(seconds, dragging);
  }

  /** The overview jumps the whole clip somewhere else in the file. */
  function jump(event) {
    const centre = timeOn(overview, event, 0, duration);
    const length = outSec - inSec;
    const nextIn = clamp(centre - length / 2, 0, Math.max(0, duration - length));
    startParts = secondsToParts(nextIn);
    endParts = secondsToParts(nextIn + length);
    winStart = clamp(nextIn + length / 2 - winLen / 2, 0, Math.max(0, duration - winLen));
    queuePreview(nextIn, "in");
  }

  function overviewDown(event) {
    if (!duration) return;
    dragging = "overview";
    try {
      overview.setPointerCapture(event.pointerId);
    } catch {
      // As above.
    }
    jump(event);
  }

  function overviewMove(event) {
    if (dragging === "overview") jump(event);
  }

  function release(event) {
    if (dragging) {
      try {
        (dragging === "overview" ? overview : detail).releasePointerCapture(event.pointerId);
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
      {#if previewUrl}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={previewUrl} controls autoplay></video>
        <span class="scrub-badge">Draft · {fmt(inSec)} → {fmt(outSec)}</span>
        <button
          type="button"
          class="scrub-exit"
          aria-label="Back to frames"
          title="Back to frames"
          onclick={() => onClearPreview?.()}
        >
          <i class="fas fa-times"></i>
        </button>
      {:else}
        {#if previewSrc}
          <img src={previewSrc} alt="Frame at {fmt(previewFor)}" />
        {/if}
        <span class="scrub-badge">{active === "in" ? "In" : "Out"} · {fmt(previewFor)}</span>
        <!-- the still is the preview slot, so clicking it plays the range here -->
        <button
          type="button"
          class="scrub-play"
          aria-label="Play this range"
          title="Play this range"
          onclick={() => onPlay?.()}
        >
          <i class="fas fa-play"></i>
        </button>
      {/if}
    </div>

    <!-- whole file: jump anywhere -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="overview"
      bind:this={overview}
      onpointerdown={overviewDown}
      onpointermove={overviewMove}
      onpointerup={release}
      onpointercancel={release}
      title="The whole file — click or drag to move the clip here"
    >
      <div class="overview-window" style="left: {ovWinPct}%; width: {ovWinLenPct}%"></div>
      <div class="overview-sel" style="left: {ovInPct}%; width: {ovLenPct}%"></div>
    </div>
    <div class="overview-ends">
      <span>00:00:00</span>
      <span>{fmt(duration)}</span>
    </div>

    <!-- zoomed window: place the edges accurately -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="scrub-track"
      bind:this={detail}
      onpointerdown={detailDown}
      onpointermove={detailMove}
      onpointerup={release}
      onpointercancel={release}
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
    <div class="overview-ends">
      <span>{fmt(winStart)}</span>
      <span class="zoom-note">zoomed · {fmt(winLen)} shown</span>
      <span>{fmt(winEnd)}</span>
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
      The top strip is the whole file — click it to move the clip there. The
      track below is zoomed in around it: drag the handles to trim, or the
      middle to slide. Focus a handle and use ← → (shift for 10s).
    </div>
  </div>
{/if}
