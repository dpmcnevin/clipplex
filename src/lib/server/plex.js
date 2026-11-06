import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
import { PLEX_TOKEN, PLEX_URL } from "./config.js";
import { PathNotAllowed, PlexUnavailable } from "./errors.js";
import { resolveMediaPath } from "./paths.js";
import { msToTime } from "./time.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

const toArray = (value) => (value === undefined || value === null ? [] : [].concat(value));

/**
 * Plex's HTTP API, not its SQLite database: that file is locked while the
 * server runs and its schema is an internal detail, while /search already
 * returns each match's file path, which is what we need to cut from.
 */
async function get(route, params = {}) {
  if (!PLEX_URL || !PLEX_TOKEN) {
    throw new PlexUnavailable("PLEX_URL and PLEX_TOKEN are not configured.");
  }
  const url = new URL(PLEX_URL.replace(/\/$/, "") + route);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("X-Plex-Token", PLEX_TOKEN);

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new PlexUnavailable(`Could not reach Plex: ${error.message}`);
  }
  if (!response.ok) throw new PlexUnavailable(`Plex returned HTTP ${response.status}.`);
  return parser.parse(await response.text());
}

/** Shape one Plex <Video> into the fields the rest of the app uses. */
function describe(video) {
  if (!video) return null;
  const part = toArray(toArray(video.Media)[0]?.Part)[0];
  const mediaPath = part?.file ?? "";
  const isEpisode = video.type === "episode";

  // Plex may know a file we cannot see, when the two sets of mounts disagree.
  // Report that here rather than failing later at cut time.
  let reachable = false;
  if (mediaPath) {
    try {
      reachable = fs.statSync(resolveMediaPath(mediaPath)).isFile();
    } catch {
      reachable = false;
    }
  }

  return {
    ratingKey: String(video.ratingKey ?? ""),
    type: video.type ?? "",
    title: String(video.title ?? ""),
    show: isEpisode ? String(video.grandparentTitle ?? "") : "",
    season: isEpisode ? String(video.parentIndex ?? "") : "",
    episode: isEpisode ? String(video.index ?? "") : "",
    year: video.year ? String(video.year) : "",
    durationStr: msToTime(Number(video.duration ?? 0)),
    path: mediaPath,
    reachable
  };
}

/** What a given user is playing right now, or null if nothing. */
export async function currentStream(username) {
  if (!username) return null;
  const sessions = await get("/status/sessions");
  const session = toArray(sessions?.MediaContainer?.Video).find((video) =>
    toArray(video.User).some((user) => String(user.title) === username)
  );
  if (!session) return null;

  const detail = await get(String(session.key));
  const entry = describe(toArray(detail?.MediaContainer?.Video)[0]);
  if (!entry) return null;

  return { ...entry, username, currentTime: msToTime(Number(session.viewOffset ?? 0)) };
}

export async function search(query, limit = 30) {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return [];
  const data = await get("/search", { query: trimmed, limit });
  return toArray(data?.MediaContainer?.Video)
    .filter((video) => video.type === "episode" || video.type === "movie")
    .map(describe)
    .filter(Boolean)
    .slice(0, limit);
}

export async function item(ratingKey) {
  const data = await get(`/library/metadata/${encodeURIComponent(ratingKey)}`);
  const entry = describe(toArray(data?.MediaContainer?.Video)[0]);
  if (!entry) throw new PlexUnavailable("Plex has no item with that id.");
  if (!entry.path) throw new PathNotAllowed("Plex did not report a file for that item.");
  return entry;
}
