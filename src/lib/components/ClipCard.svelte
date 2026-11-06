<script>
  let { clip, shareUrl = "", onDelete, onGif, onShare, onCopy } = $props();
</script>

<article class="clip">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video controls preload="metadata">
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
    <div class="clip-sub">
      {#if clip.sourceTime}at {clip.sourceTime}{/if}
      {#if clip.username} · {clip.username}{/if}
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
