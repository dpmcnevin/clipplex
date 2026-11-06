import fs from "node:fs";
import path from "node:path";
import { CLIPS_DIR, ensureDirs, mediaRoots } from "./config.js";
import { PathNotAllowed } from "./errors.js";

/**
 * Resolve `candidate` and refuse it unless it stays inside `base`.
 *
 * path.resolve collapses ".." lexically, and realpath (when the file already
 * exists) also defeats a symlink pointing out of the tree. Output files do
 * not exist yet, so a missing path is normal and only gets the lexical check.
 */
function confine(base, candidate) {
  const root = fs.realpathSync(base);
  let full = path.resolve(root, candidate);
  try {
    full = fs.realpathSync(full);
  } catch {
    // Not created yet: the lexical resolve above still applies.
  }
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new PathNotAllowed("That path is outside the allowed directory.");
  }
  return full;
}

/** Resolve a clip path from the UI, confined to the clip directory. */
export function resolveClipPath(relativePath) {
  if (!relativePath) throw new PathNotAllowed("No file was given.");
  ensureDirs();
  return confine(CLIPS_DIR, relativePath);
}

/** Resolve a source-media path, confined to the configured roots. */
export function resolveMediaPath(candidate) {
  const roots = mediaRoots();
  if (!roots.length) throw new PathNotAllowed("No media roots are configured.");
  if (!candidate) return roots[0];
  for (const root of roots) {
    try {
      return confine(root, candidate);
    } catch {
      // Try the next root.
    }
  }
  throw new PathNotAllowed("That path is outside the configured media roots.");
}

/** The path the browser uses to fetch a stored clip. */
export function toWebPath(fullPath) {
  return path.relative(fs.realpathSync(CLIPS_DIR), fullPath).split(path.sep).join("/");
}
