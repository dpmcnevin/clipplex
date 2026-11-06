<script>
  let { onPick } = $props();

  let listing = $state({ path: "", parent: null, roots: [], dirs: [], files: [] });
  let status = $state("Loading…");
  let pickedPath = $state("");

  async function go(target = "") {
    status = "Loading…";
    try {
      const response = await fetch(`/api/browse?path=${encodeURIComponent(target)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      listing = data;
      status = data.dirs.length || data.files.length ? "" : "Nothing here.";
    } catch (error) {
      status = `Could not browse: ${error.message}`;
    }
  }

  function humanSize(bytes) {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let index = 0;
    let size = bytes;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
  }

  async function pick(file) {
    pickedPath = file.path;
    onPick({ label: file.name, meta: "reading…", path: file.path });
    try {
      const response = await fetch(`/api/media-info?path=${encodeURIComponent(file.path)}`);
      const data = await response.json();
      onPick({
        label: file.name,
        meta: response.ok ? data.durationStr : data.message || "",
        path: file.path
      });
    } catch {
      onPick({ label: file.name, meta: "", path: file.path });
    }
  }

  go();
</script>

<div class="breadcrumb">
  {#each listing.roots as root (root.path)}
    <button
      type="button"
      class="chip"
      class:chip--on={listing.path === root.path}
      onclick={() => go(root.path)}
    >{root.name}</button>
  {/each}
  <span class="crumb-path">{listing.path}</span>
</div>

<div class="picker">
  {#if status}
    <div class="picker-row muted">{status}</div>
  {:else}
    {#if listing.parent}
      <button type="button" class="picker-row" onclick={() => go(listing.parent)}>
        <i class="fas fa-level-up-alt"></i>
        <span class="picker-name">..</span>
        <span class="picker-meta"></span>
      </button>
    {/if}
    {#each listing.dirs as dir (dir.path)}
      <button type="button" class="picker-row" onclick={() => go(dir.path)}>
        <i class="fas fa-folder"></i>
        <span class="picker-name">{dir.name}</span>
        <span class="picker-meta"></span>
      </button>
    {/each}
    {#each listing.files as file (file.path)}
      <button
        type="button"
        class="picker-row"
        class:picked={pickedPath === file.path}
        onclick={() => pick(file)}
      >
        <i class="fas fa-file-video"></i>
        <span class="picker-name">{file.name}</span>
        <span class="picker-meta">{humanSize(file.size)}</span>
      </button>
    {/each}
  {/if}
</div>
