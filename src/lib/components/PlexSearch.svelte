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

  function clear() {
    query = "";
    results = [];
    status = "";
  }

  // Two lines: what it is, then which part of it. Squeezing both onto one
  // line in a narrow column cut off the episode, which is the bit you need.
  const headline = (item) => item.show || item.title;
  const detail = (item) =>
    item.show
      ? `S${item.season}E${item.episode} · ${item.title}`
      : [item.year, item.type].filter(Boolean).join(" · ");

  function pick(item) {
    pickedKey = item.ratingKey;
    onPick({
      label: item.show ? `${headline(item)} · ${detail(item)}` : headline(item),
      meta: item.durationStr,
      ratingKey: item.ratingKey,
      path: item.path,
      duration: item.duration
    });
  }
</script>

<div class="search-field">
  <i class="fas fa-search"></i>
  <input
    type="text"
    placeholder="Search your Plex library"
    aria-label="Search your Plex library"
    bind:value={query}
    oninput={queue}
    onkeydown={(event) => event.key === "Enter" && (event.preventDefault(), run())}
  />
  {#if query}
    <button type="button" class="search-clear" aria-label="Clear search" onclick={clear}>
      <i class="fas fa-times"></i>
    </button>
  {/if}
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
        <span class="picker-text">
          <span class="picker-line">
            <span class="picker-name">{headline(item)}</span>
            <span class="picker-meta">{item.reachable ? item.durationStr : "unavailable"}</span>
          </span>
          {#if detail(item)}
            <span class="picker-sub">{detail(item)}</span>
          {/if}
          {#if !item.reachable}
            <span class="picker-reason">
              Plex has this at {item.path}, which Clipplex cannot see — check that
              both containers mount the media at the same paths.
            </span>
          {/if}
        </span>
      </button>
    {/each}
  </div>
{/if}
