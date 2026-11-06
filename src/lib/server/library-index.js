import fs from "node:fs/promises";
import path from "node:path";
import { CLIPS_DIR, VIDEO_EXTENSIONS, ensureDirs, mediaRoots } from "./config.js";
import { cuesFor, subtitleTrack } from "./subtitles.js";
import { secondsToTime } from "./time.js";

const MANIFEST = () => path.join(CLIPS_DIR, "subs", "manifest.json");

// Plex transcodes on the same box, so leave it cores and run behind it.
const CONCURRENCY = 1;
const BACKGROUND = { nice: 15 };

/** path -> { size, mtime, kind, count } */
let manifest = null;
let corpus = null;        // [{ file, title, cues: [{start, text}] }]
let corpusStamp = -1;
let manifestStamp = 0;

let state = {
  status: "idle",
  scanned: 0,
  total: 0,
  withText: 0,
  withoutText: 0,
  bitmap: 0,
  failed: 0,
  cues: 0,
  current: "",
  startedAt: null,
  finishedAt: null,
  error: ""
};

let cancelled = false;

export function stopIndex() {
  if (state.status === "running" || state.status === "scanning") {
    cancelled = true;
    state.status = "stopping";
  }
  return indexStatus();
}

export function indexStatus() {
  return { ...state, indexed: manifest ? manifest.size : 0 };
}

async function loadManifest() {
  if (manifest) return manifest;
  ensureDirs();
  await fs.mkdir(path.dirname(MANIFEST()), { recursive: true });
  try {
    manifest = new Map(Object.entries(JSON.parse(await fs.readFile(MANIFEST(), "utf8"))));
  } catch {
    manifest = new Map();
  }
  return manifest;
}

async function saveManifest() {
  if (!manifest) return;
  try {
    await fs.writeFile(MANIFEST(), JSON.stringify(Object.fromEntries(manifest)));
    manifestStamp += 1;
  } catch {
    // An unwritable manifest costs a re-scan, nothing worse.
  }
}

async function* walk(dir, depth = 0) {
  if (depth > 6) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;     // .AppleDouble and friends
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, depth + 1);
    else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

/**
 * Walk the media roots and pull the text subtitles out of everything that
 * has them. Resumable: a file whose size and mtime match the manifest is
 * skipped, so a second run costs a stat per file rather than an ffprobe.
 */
export async function startIndex({ rebuild = false } = {}) {
  if (state.status === "running") return indexStatus();

  await loadManifest();
  if (rebuild) manifest.clear();

  cancelled = false;
  state = {
    ...state,
    status: "running",
    scanned: 0,
    total: 0,
    withText: 0,
    withoutText: 0,
    bitmap: 0,
    failed: 0,
    cues: 0,
    current: "",
    startedAt: Date.now(),
    finishedAt: null,
    error: ""
  };

  // Deliberately not awaited: indexing runs for minutes and the request
  // should return at once.
  (async () => {
    try {
      state.status = "scanning";
      const files = [];
      for (const root of mediaRoots()) {
        for await (const file of walk(root)) {
          files.push(file);
          state.total = files.length;
        }
      }
      // Smallest first: extraction time tracks file size almost exactly, so
      // this front-loads the episodes and leaves the big remuxes till last.
      const sized = [];
      for (const file of files) {
        try {
          sized.push({ file, size: (await fs.stat(file)).size });
        } catch {
          sized.push({ file, size: 0 });
        }
      }
      sized.sort((a, b) => a.size - b.size);
      files.length = 0;
      files.push(...sized.map((item) => item.file));
      state.status = "running";

      let cursor = 0;
      const worker = async () => {
        while (cursor < files.length && !cancelled) {
          const file = files[cursor++];
          state.current = path.basename(file);
          try {
            const stat = await fs.stat(file);
            const known = manifest.get(file);
            if (known && known.size === stat.size && known.mtime === Math.round(stat.mtimeMs)) {
              if (known.kind === "text") {
                state.withText += 1;
                state.cues += known.count ?? 0;
              } else if (known.kind === "bitmap") state.bitmap += 1;
              else if (known.kind === "none") state.withoutText += 1;
              state.scanned += 1;
              continue;
            }

            const entry = { size: stat.size, mtime: Math.round(stat.mtimeMs), kind: "none", count: 0 };
            const track = await subtitleTrack(file, BACKGROUND);
            if (track.available) {
              const found = await cuesFor(file, BACKGROUND, track);
              entry.kind = "text";
              entry.count = found.cues?.length ?? 0;
              state.withText += 1;
              state.cues += entry.count;
            } else if (/images/.test(track.reason ?? "")) {
              entry.kind = "bitmap";
              state.bitmap += 1;
            } else {
              state.withoutText += 1;
            }
            manifest.set(file, entry);
          } catch {
            state.failed += 1;
            manifest.set(file, { size: 0, mtime: 0, kind: "error", count: 0 });
          }
          state.scanned += 1;
          if (state.scanned % 50 === 0) await saveManifest();
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      await saveManifest();
      corpus = null;                       // rebuilt on the next search
      state.status = cancelled ? "stopped" : "done";
      state.current = "";
      state.finishedAt = Date.now();
    } catch (error) {
      state.status = "error";
      state.error = error.message;
      state.finishedAt = Date.now();
    }
  })();

  return indexStatus();
}

function titleFor(file) {
  const stem = path.basename(file, path.extname(file));
  const parent = path.basename(path.dirname(file));
  const grand = path.basename(path.dirname(path.dirname(file)));
  // ".../Andor/Season 1/Andor - 1x01 - Episode 1.mkv" reads better as the
  // show plus the episode than as a bare filename.
  return /^season/i.test(parent) ? `${grand} · ${stem}` : stem;
}

/** Cue text for every indexed file, held in memory between searches. */
async function loadCorpus() {
  await loadManifest();
  if (corpus && corpusStamp === manifestStamp) return corpus;

  const built = [];
  for (const [file, entry] of manifest) {
    if (entry.kind !== "text" || !entry.count) continue;
    try {
      const found = await cuesFor(file);              // served from its cache file
      if (!found.cues?.length) continue;
      built.push({
        file,
        title: titleFor(file),
        cues: found.cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }))
      });
    } catch {
      // Skip anything that will not load.
    }
  }
  corpus = built;
  corpusStamp = manifestStamp;
  return corpus;
}

export async function searchLibrary(query, limit = 80) {
  const needle = (query ?? "").trim().toLowerCase();
  if (!needle) return { results: [], files: 0, searched: 0 };

  const loaded = await loadCorpus();
  const results = [];
  let searched = 0;

  for (const item of loaded) {
    searched += item.cues.length;
    for (const cue of item.cues) {
      if (!cue.text.toLowerCase().includes(needle)) continue;
      results.push({
        path: item.file,
        title: item.title,
        start: cue.start,
        end: cue.end,
        startStr: secondsToTime(cue.start),
        text: cue.text
      });
      if (results.length >= limit) return { results, files: loaded.length, searched, capped: true };
    }
  }
  return { results, files: loaded.length, searched };
}
