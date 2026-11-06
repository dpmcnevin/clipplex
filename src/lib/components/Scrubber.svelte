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

  function down(event) {
    if (!duration) return;
    const seconds = timeAt(event);
    dragging = Math.abs(seconds - inSec) <= Math.abs(seconds - outSec) ? "in" : "out";
    track.setPointerCapture(event.pointerId);
    apply(seconds, dragging);
  }

  function move(event) {
    if (dragging) apply(timeAt(event), dragging);
  }

  function up(event) {
    if (dragging) track.releasePointerCapture?.(event.pointerId);
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
      <div class="scrub-range" style="left: {inPct}%; width: {Math.max(0, outPct - inPct)}%"></div>
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
    <div class="scrub-hint">Drag the handles, or focus one and use ← → (hold shift for 10s)</div>
  </div>
{/if}
