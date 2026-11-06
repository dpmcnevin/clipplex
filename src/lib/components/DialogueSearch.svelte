<script>
  /** Find a moment by what was said, then jump the clip to that line. */
  let { path, onPick } = $props();

  let probed = $state(null);     // {available, reason, language}
  let query = $state("");
  let results = $state([]);
  let status = $state("");
  let open = $state(false);
  let probedFor = $state("");
  let timer = null;

  // Probing only reads the stream list, so selecting a file stays cheap;
  // the track itself is extracted on the first actual search.
  $effect(() => {
    if (!path || path === probedFor) return;
    probedFor = path;
    probed = null;
    query = "";
    results = [];
    status = "";
    fetch(`/api/dialogue?path=${encodeURIComponent(path)}`)
      .then((response) => response.json())
      .then((data) => (probed = data))
      .catch((error) => (probed = { available: false, reason: error.message }));
  });

  function queue() {
    clearTimeout(timer);
    timer = setTimeout(run, 350);
  }

  async function run() {
    clearTimeout(timer);
    if (!query.trim()) {
      results = [];
      status = "";
      return;
    }
    status = "Searching the subtitles…";
    try {
      const response = await fetch(
        `/api/dialogue?path=${encodeURIComponent(path)}&q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.available) {
        probed = data;
        results = [];
        status = "";
        return;
      }
      results = data.results;
      status = results.length ? "" : "No line matches that.";
    } catch (error) {
      results = [];
      status = `Search failed: ${error.message}`;
    }
  }
</script>

{#if probed}
  <div class="dialogue">
    {#if probed.available}
      <button type="button" class="dialogue-toggle" onclick={() => (open = !open)}>
        <i class="fas fa-closed-captioning"></i>
        Find a line
        {#if probed.language}<span class="dialogue-lang">{probed.language}</span>{/if}
        <i class="fas fa-chevron-{open ? 'up' : 'down'} dialogue-chevron"></i>
      </button>

      {#if open}
        <div class="search-field">
          <i class="fas fa-quote-left"></i>
          <input
            type="text"
            placeholder="Something that was said"
            aria-label="Search the dialogue"
            bind:value={query}
            oninput={queue}
            onkeydown={(event) => event.key === "Enter" && (event.preventDefault(), run())}
          />
          {#if query}
            <button type="button" class="search-clear" aria-label="Clear" onclick={() => { query = ""; results = []; status = ""; }}>
              <i class="fas fa-times"></i>
            </button>
          {/if}
        </div>

        {#if status || results.length}
          <div class="picker cues">
            {#if status}
              <div class="picker-row muted">{status}</div>
            {/if}
            {#each results as cue (cue.start)}
              <button type="button" class="picker-row" onclick={() => onPick(cue)}>
                <span class="cue-time">{cue.startStr}</span>
                <span class="cue-text">{cue.text}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    {:else}
      <div class="dialogue-none">
        <i class="fas fa-closed-captioning"></i>
        <span>{probed.reason}</span>
      </div>
    {/if}
  </div>
{/if}
