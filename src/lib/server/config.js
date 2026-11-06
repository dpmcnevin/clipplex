import { env } from "$env/dynamic/private";
import fs from "node:fs";
import path from "node:path";

export const CLIPS_DIR = env.CLIPS_DIR || "/clips";
export const VIDEOS_DIR = path.join(CLIPS_DIR, "videos");
export const IMAGES_DIR = path.join(CLIPS_DIR, "images");
export const PREVIEWS_DIR = path.join(CLIPS_DIR, "previews");

export const PLEX_URL = env.PLEX_URL || "";
export const PLEX_TOKEN = env.PLEX_TOKEN || "";
export const PLEX_USERNAME = env.PLEX_USERNAME || "";

export const STREAMABLE_LOGIN = env.STREAMABLE_LOGIN || "";
export const STREAMABLE_PASSWORD = env.STREAMABLE_PASSWORD || "";

export const hasPlex = () => Boolean(PLEX_URL && PLEX_TOKEN);

export const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".mkv", ".avi", ".m4v", ".mov", ".webm",
  ".ts", ".m2ts", ".mpg", ".mpeg", ".wmv", ".flv"
]);

/** The directories that can be browsed for source media. */
export function mediaRoots() {
  const raw = env.MEDIA_ROOTS || "/data";
  const roots = [];
  for (const item of raw.split(":")) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    try {
      const resolved = fs.realpathSync(trimmed);
      if (fs.statSync(resolved).isDirectory() && !roots.includes(resolved)) {
        roots.push(resolved);
      }
    } catch {
      // A root that is not mounted is simply not offered.
    }
  }
  return roots;
}

export function ensureDirs() {
  for (const dir of [VIDEOS_DIR, IMAGES_DIR, PREVIEWS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
