import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { IMAGES_DIR, VIDEOS_DIR, ensureDirs } from "./config.js";
import { ClipError, PathNotAllowed } from "./errors.js";
import { resolveClipPath, resolveMediaPath, toWebPath } from "./paths.js";
import { frameRateOf, probe, runWithProgress } from "./ffmpeg.js";
import { secondsToTime } from "./time.js";
import * as plex from "./plex.js";

const sidecarFor = (clipPath) => clipPath.replace(/\.mp4$/i, ".json");
const gifFor = (clipPath) => clipPath.replace(/\.mp4$/i, ".gif");

const tidy = (text) => text.replace(/[._]+/g, " ").replace(/^[\s\-_.]+|[\s\-_.]+$/g, "");

/** Pull show / season / episode out of a filename when it looks like one. */
function parseEpisode(stem) {
  const match = stem.match(/^(?<show>.+?)[ ._-]+[Ss](?<season>\d{1,2})[ ._-]?[Ee](?<episode>\d{1,3})(?<rest>.*)$/);
  if (!match) return { show: "", season: "", episode: "", title: tidy(stem) };
  const { show, season, episode, rest } = match.groups;
  return {
    show: tidy(show),
    season: String(Number(season)),
    episode: String(Number(episode)),
    title: tidy(rest)
  };
}

/**
 * Where a clip is cut from, independent of how it was chosen. Plex gives
 * richer metadata; a file off disk gives whatever its name reveals.
 */
export async function sourceFrom({ kind, username, ratingKey, filePath }) {
  if (kind === "plex") {
    const stream = await plex.currentStream(username);
    if (!stream) throw new ClipError(`No session running for user ${username}`);
    return {
      mediaPath: resolveMediaPath(stream.path),
      title: stream.title,
      show: stream.show,
      season: stream.season,
      episode: stream.episode,
      username,
      sourceTime: stream.currentTime
    };
  }

  if (kind === "item") {
    const entry = await plex.item(ratingKey);
    return {
      mediaPath: resolveMediaPath(entry.path),
      title: entry.title,
      show: entry.show,
      season: entry.season,
      episode: entry.episode,
      username: "",
      sourceTime: ""
    };
  }

  if (kind === "file") {
    const full = resolveMediaPath(filePath);
    if (!existsSync(full)) throw new PathNotAllowed("That file does not exist.");
    const parsed = parseEpisode(path.basename(full, path.extname(full)));
    return { mediaPath: full, ...parsed, username: "", sourceTime: "" };
  }

  throw new ClipError(`Unknown clip source '${kind}'.`);
}

export function slugFor(source) {
  const name = source.show ? `${source.show}-${source.title}` : source.title;
  return name.replace(/\s+/g, "").replace(/[^\w.-]/g, "") || "clip";
}

export async function cutClip({ source, start, duration, onProgress }) {
  ensureDirs();
  const output = path.join(VIDEOS_DIR, `${slugFor(source)}_${Math.floor(Date.now() / 1000)}.mp4`);

  await runWithProgress(
    [
      "-y",
      "-ss", start,
      "-i", source.mediaPath,
      "-t", String(duration),
      "-map_metadata", "-1",
      "-c:v", "libx264",
      // AAC, not Vorbis: Vorbis in an MP4 container is not standard and
      // leaves some players with no audio at all.
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      "-crf", "18",
      "-metadata", `title=${source.title}`,
      "-metadata", `show=${source.show}`,
      "-metadata", `season_number=${source.season}`,
      "-metadata", `episode_id=${source.episode}`,
      "-metadata", `comment=${source.sourceTime}`,
      "-metadata", `artist=${source.username}`,
      output
    ],
    { totalSeconds: duration, onProgress }
  );

  await writeSidecar(output, {
    title: source.title,
    show: source.show,
    season: source.season,
    episode: source.episode,
    sourceTime: source.sourceTime,
    username: source.username,
    duration,
    durationStr: secondsToTime(duration)
  });

  return output;
}

/**
 * Two passes: one to build a palette tuned to this clip, one to apply it.
 * A single pass quantises to a generic 256-colour palette and bands badly.
 */
export async function makeGif(clipFullPath, { width = 480, fps = 15, onProgress } = {}) {
  const gifPath = gifFor(clipFullPath);
  const palettePath = `${gifPath}.palette.png`;
  const filters = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  let total = 0;
  try {
    total = Number((await probe(clipFullPath))?.format?.duration ?? 0);
  } catch {
    total = 0;
  }

  try {
    await runWithProgress([
      "-y", "-i", clipFullPath,
      "-vf", `${filters},palettegen=stats_mode=diff`,
      "-frames:v", "1", palettePath
    ]);
    await runWithProgress(
      [
        "-y", "-i", clipFullPath, "-i", palettePath,
        "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
        "-loop", "0", gifPath
      ],
      { totalSeconds: total, onProgress }
    );
  } finally {
    await fs.rm(palettePath, { force: true });
  }
  return gifPath;
}

async function writeSidecar(clipPath, meta) {
  try {
    await fs.writeFile(sidecarFor(clipPath), JSON.stringify(meta, null, 2));
  } catch {
    // The sidecar is a cache; a clip without one still works.
  }
}

/**
 * Metadata for a clip. New clips carry a sidecar written at creation; older
 * ones are probed once and then get a sidecar, so the library stops paying
 * for an ffprobe per clip on every page load.
 */
export async function metadataFor(clipPath) {
  try {
    return JSON.parse(await fs.readFile(sidecarFor(clipPath), "utf8"));
  } catch {
    // Fall through to probing.
  }

  let tags = {};
  try {
    tags = (await probe(clipPath))?.format?.tags ?? {};
  } catch {
    tags = {};
  }
  const meta = {
    title: tags.title ?? "",
    show: tags.show ?? "",
    season: tags.season_number ?? "",
    episode: tags.episode_id ?? "",
    sourceTime: tags.comment ?? "",
    username: tags.artist ?? ""
  };
  await writeSidecar(clipPath, meta);
  return meta;
}

export async function listClips() {
  ensureDirs();
  const names = await fs.readdir(VIDEOS_DIR);
  const clips = await Promise.all(
    names
      .filter((name) => name.toLowerCase().endsWith(".mp4"))
      .map(async (name) => {
        const full = path.join(VIDEOS_DIR, name);
        const [meta, stat] = await Promise.all([metadataFor(full), fs.stat(full)]);
        const gif = gifFor(full);
        return {
          ...meta,
          filePath: toWebPath(full),
          gifPath: existsSync(gif) ? toWebPath(gif) : "",
          size: stat.size,
          mtime: stat.mtimeMs
        };
      })
  );
  return clips.sort((a, b) => b.mtime - a.mtime);
}

export async function deleteClip(relativePath) {
  const full = resolveClipPath(relativePath);
  await fs.rm(full);
  // A clip owns its GIF and its sidecar.
  await Promise.all([
    fs.rm(gifFor(full), { force: true }),
    fs.rm(sidecarFor(full), { force: true })
  ]);
}

export async function listSnapshots() {
  ensureDirs();
  const names = await fs.readdir(IMAGES_DIR);
  return names
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => toWebPath(path.join(IMAGES_DIR, name)));
}

export async function takeSnapshot(mediaPath, time) {
  ensureDirs();
  const frames = await frameRateOf(mediaPath);
  await runWithProgress([
    "-y",
    "-ss", time,
    "-i", mediaPath,
    "-vframes", String(frames),
    "-qscale:v", "2",
    path.join(IMAGES_DIR, `${time.replace(/:/g, "_")}_%03d.jpg`)
  ]);
  return frames;
}
