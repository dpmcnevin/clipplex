import fs from "node:fs/promises";
import path from "node:path";
import { VIDEO_EXTENSIONS, mediaRoots } from "./config.js";
import { PathNotAllowed } from "./errors.js";
import { resolveMediaPath } from "./paths.js";
import { durationOf } from "./ffmpeg.js";
import { secondsToTime } from "./time.js";

/** List sub-directories and playable files under a media root. */
export async function browse(requested = "") {
  const roots = mediaRoots();
  const full = resolveMediaPath(requested);

  let entries;
  try {
    entries = await fs.readdir(full, { withFileTypes: true });
  } catch (error) {
    throw new PathNotAllowed(`Could not read that directory: ${error.message}`);
  }

  const dirs = [];
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(full, entry.name);
    if (entry.isDirectory()) {
      dirs.push({ name: entry.name, path: entryPath });
    } else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      let size = 0;
      try {
        size = (await fs.stat(entryPath)).size;
      } catch {
        // Unreadable entries are listed without a size.
      }
      files.push({ name: entry.name, path: entryPath, size });
    }
  }

  const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  dirs.sort(byName);
  files.sort(byName);

  return {
    path: full,
    parent: roots.includes(full) ? null : path.dirname(full),
    roots: roots.map((root) => ({ name: path.basename(root) || root, path: root })),
    dirs,
    files
  };
}

export async function mediaInfo(requested) {
  const full = resolveMediaPath(requested);
  const duration = await durationOf(full);
  return {
    path: full,
    name: path.basename(full),
    duration,
    durationStr: secondsToTime(duration)
  };
}
