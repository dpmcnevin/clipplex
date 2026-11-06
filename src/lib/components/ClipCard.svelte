<script>
  let { clip, shareUrl = "", isNew = false, onDelete, onGif, onShare, onCopy } = $props();

  function humanSize(bytes) {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let index = 0;
    let size = bytes;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
  }
</script>

<article class="clip" class:clip--new={isNew}>
  <!-- svelte-ignore a11y_media_has_caption -->
  <!-- preload="none" with a poster: a library of clips should not cost one
       metadata request per card on every page load. -->
  <video controls preload="none" poster={clip.posterPath ? `/media/${clip.posterPath}` : undefined}>
    <source src="/media/{clip.filePath}" type="video/mp4" />
  </video>

  {#if shareUrl}
    <div class="clip-share">
      <a href={shareUrl} target="_blank" rel="noopener">{shareUrl.replace(/^https:\/\//, "")}</a>
      <button type="button" class="chip" onclick={() => onCopy(shareUrl)}>Copy</button>
    </div>
  {/if}

  {#if clip.gifPath}
    <div class="clip-gif">
      <i class="fas fa-file-image"></i>
      <a href="/media/{clip.gifPath}" target="_blank" rel="noopener">GIF ready</a>
      <a class="chip" href="/media/{clip.gifPath}" download>Download</a>
    </div>
  {/if}

  <div class="clip-body">
    {#if clip.show}
      <div class="clip-title">{clip.show}</div>
      <div class="clip-sub">S{clip.season}E{clip.episode} · {clip.title}</div>
    {:else}
      <div class="clip-title">{clip.title || "Untitled clip"}</div>
    {/if}

    <div class="clip-facts">
      {#if clip.durationStr}<span class="fact">{clip.durationStr}</span>{/if}
      {#if clip.size}<span class="fact">{humanSize(clip.size)}</span>{/if}
      {#if clip.sourceTime}<span>at {clip.sourceTime}</span>{/if}
      {#if clip.username}<span>{clip.username}</span>{/if}
    </div>
  </div>

  <div class="clip-actions">
    <a class="icon-btn" href="/media/{clip.filePath}" download title="Download">
      <i class="fas fa-download"></i>
    </a>
    <button type="button" class="icon-btn icon-btn--danger" onclick={() => onDelete(clip)} title="Delete">
      <i class="fas fa-trash-alt"></i>
    </button>
    {#if !clip.gifPath}
      <button type="button" class="icon-btn" onclick={() => onGif(clip)} title="Make a GIF">
        <i class="fas fa-file-image"></i>
      </button>
    {/if}
    <span class="spacer"></span>
    <button type="button" class="streamable-btn" onclick={() => onShare(clip)}>
      <img src="/icons/streamable.png" height="16" alt="" /> Share
    </button>
  </div>
</article>
