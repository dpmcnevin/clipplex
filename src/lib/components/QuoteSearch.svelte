<script>
  /** Search every indexed subtitle in the library, not just one file. */
  let { onPick } = $props();

  let index = $state(null);
  let query = $state("");
  let results = $state([]);
  let status = $state("");
  let picked = $state("");
  let timer = null;
  let poll = null;

  const number = (value) => (value ?? 0).toLocaleString();

  async function refresh() {
    try {
      index = await (await fetch("/api/library")).json();
    } catch {
      /* leave the last status on screen */
    }
    clearTimeout(poll);
    if (["running", "scanning", "stopping"].includes(index?.status)) poll = setTimeout(refresh, 2000);
  }

  refresh();

  async function build(rebuild) {
    await fetch(`/api/library?rebuild=${rebuild ? 1 : 0}`, { method: "POST" });
    refresh();
  }

  async function stop() {
    await fetch("/api/library?stop=1", { method: "POST" });
    refresh();
  }

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
    try {
      const data = await (await fetch(`/api/library?q=${encodeURIComponent(query)}`)).json();
      results = data.results ?? [];
      index = data.index ?? index;
      status = results.length
        ? data.capped ? `First ${results.length} matches` : ""
        : `No match in ${number(data.searched)} lines.`;
    } catch (error) {
      results = [];
      status = `Search failed: ${error.message}`;
    }
  }
</script>

{#if index}
  <div class="index-bar">
    {#if index.status === "running" || index.status === "scanning" || index.status === "stopping"}
      <div class="index-line">
        <span>
          {index.status === "scanning" ? "Finding files…" : index.status === "stopping" ? "Stopping…" : "Indexing…"}
          {number(index.scanned)} of {number(index.total)}
        </span>
        <button type="button" class="chip" onclick={stop}>Stop</button>
      </div>
      <div class="progress index-progress">
        <div
          class="progress-bar"
          style="width: {index.total ? Math.round((index.scanned / index.total) * 100) : 0}%"
        ></div>
      </div>
      <div class="index-sub">
        {number(index.withText)} with subtitles · {number(index.cues)} lines
        {#if index.current} · {index.current}{/if}
      </div>
    {:else if index.indexed > 0}
      <div class="index-line">
        <span>{number(index.withText)} files · {number(index.cues)} lines indexed</span>
        <button type="button" class="chip" onclick={() => build(false)}>
          {index.indexed < index.total || index.status === "stopped" ? "Continue" : "Update"}
        </button>
      </div>
      {#if index.bitmap || index.withoutText}
        <div class="index-sub">
          {number(index.withoutText)} without subtitles, {number(index.bitmap)} image-only
        </div>
      {/if}
    {:else}
      <div class="index-line">
        <span>Nothing indexed yet.</span>
        <button type="button" class="chip chip--on" onclick={() => build(true)}>Build index</button>
      </div>
      <div class="index-sub">
        Reads the subtitles out of every file. Runs in the background and can
        take a while the first time.
      </div>
    {/if}
  </div>
{/if}

<div class="search-field">
  <i class="fas fa-quote-left"></i>
  <input
    type="text"
    placeholder="Any line, from anything"
    aria-label="Search all subtitles"
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
    {#each results as hit (hit.path + hit.start)}
      <button
        type="button"
        class="picker-row"
        class:picked={picked === hit.path + hit.start}
        onclick={() => { picked = hit.path + hit.start; onPick(hit); }}
      >
        <span class="picker-text">
          <span class="cue-text">{hit.text}</span>
          <span class="quote-where">
            <span class="cue-time">{hit.startStr}</span>
            {hit.title}
          </span>
        </span>
      </button>
    {/each}
  </div>
{/if}
