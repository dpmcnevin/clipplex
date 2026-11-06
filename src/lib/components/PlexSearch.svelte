<script>
  let { onPick } = $props();

  let query = $state("");
  let results = $state([]);
  let status = $state("");
  let pickedKey = $state("");
  let timer = null;

  function queue() {
    clearTimeout(timer);
    timer = setTimeout(run, 400);
  }

  async function run() {
    clearTimeout(timer);
    if (!query.trim()) {
      results = [];
      status = "";
      return;
    }
    status = "Searching…";
    results = [];
    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      results = data.results;
      status = results.length ? "" : "Nothing found.";
    } catch (error) {
      status = `Search failed: ${error.message}`;
    }
  }

  const labelFor = (item) =>
    item.show
      ? `${item.show} · S${item.season}E${item.episode} · ${item.title}`
      : item.title + (item.year ? ` (${item.year})` : "");

  function pick(item) {
    pickedKey = item.ratingKey;
    onPick({
      label: labelFor(item),
      meta: item.durationStr,
      ratingKey: item.ratingKey,
      path: item.path,
      duration: item.duration
    });
  }
</script>

<div class="field">
  <label for="plex-search">Search</label>
  <input
    id="plex-search"
    type="text"
    size="28"
    placeholder="Title, show or episode"
    bind:value={query}
    oninput={queue}
    onkeydown={(event) => event.key === "Enter" && (event.preventDefault(), run())}
  />
  <button type="button" class="btn btn--ghost" onclick={run}>
    <i class="fas fa-search"></i> Search
  </button>
</div>

{#if status || results.length}
  <div class="picker">
    {#if status}
      <div class="picker-row muted">{status}</div>
    {/if}
    {#each results as item (item.ratingKey)}
      <button
        type="button"
        class="picker-row"
        class:picked={pickedKey === item.ratingKey}
        class:picker-row--off={!item.reachable}
        disabled={!item.reachable}
        onclick={() => pick(item)}
      >
        <i class="fas {item.show ? 'fa-tv' : 'fa-film'}"></i>
        <span class="picker-name">
          {labelFor(item)}
          {#if !item.reachable}
            <!-- A tooltip is invisible on touch, and this is the one message
                 that explains a mount mismatch. -->
            <span class="picker-reason">
              Plex has this at {item.path}, which Clipplex cannot see — check
              that both containers mount the media at the same paths.
            </span>
          {/if}
        </span>
        <span class="picker-meta">{item.reachable ? item.durationStr : "unavailable"}</span>
      </button>
    {/each}
  </div>
{/if}
