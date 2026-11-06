import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import { CLIPS_DIR, ensureDirs } from "./config.js";
import { ClipError } from "./errors.js";
import { probe, run } from "./ffmpeg.js";
import { resolveMediaPath } from "./paths.js";
import { secondsToTime } from "./time.js";

const TEXT_CODECS = new Set(["subrip", "ass", "ssa", "mov_text", "webvtt", "text"]);
const BITMAP_CODECS = new Set(["hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle", "xsub"]);

// A sidecar is a few kilobytes of text, so it costs nothing next to demuxing
// a multi-gigabyte container. .idx/.sub are VobSub, which are images.
const SIDECAR_EXTENSIONS = [".srt", ".ass", ".ssa", ".vtt"];

function sidecarFor(mediaPath) {
  const stem = mediaPath.replace(/\.[^.]+$/, "");
  for (const ext of SIDECAR_EXTENSIONS) {
    for (const candidate of [stem + ext, stem + ".en" + ext, stem + ".eng" + ext]) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Next candidate.
      }
    }
  }
  return null;
}

const cacheDir = () => path.join(CLIPS_DIR, "subs");

/**
 * Which subtitle stream to read, if any.
 *
 * Only text subtitles can be searched. Bitmap tracks (PGS and friends) are
 * pictures of words, so they are reported as unsearchable rather than
 * silently returning nothing.
 */
export async function subtitleTrack(mediaPath, options) {
  const sidecar = sidecarFor(mediaPath);
  if (sidecar) {
    return { available: true, sidecar, codec: path.extname(sidecar).slice(1), language: "", ordinal: -1 };
  }

  let subtitles = [];
  try {
    // Only the subtitle stream list is needed, and the probe is capped: the
    // default scan reads far more of the file than this question requires.
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-analyzeduration", "1M",
      "-probesize", "2M",
      "-select_streams", "s",
      "-show_entries", "stream=codec_name:stream_tags=language,title",
      "-print_format", "json",
      mediaPath
    ], options);
    subtitles = JSON.parse(stdout).streams ?? [];
  } catch (error) {
    return { available: false, reason: `Could not read this file: ${error.message}` };
  }
  if (!subtitles.length) {
    return { available: false, reason: "This file has no subtitle track." };
  }

  // -map 0:s:N counts subtitle streams, not absolute stream indexes.
  const text = subtitles
    .map((stream, ordinal) => ({ stream, ordinal }))
    .filter(({ stream }) => TEXT_CODECS.has(stream.codec_name));

  if (!text.length) {
    const kinds = [...new Set(subtitles.map((s) => s.codec_name))].join(", ");
    return {
      available: false,
      reason: BITMAP_CODECS.has(subtitles[0].codec_name)
        ? `This file's subtitles are images (${kinds}), so there is no text to search.`
        : `No searchable subtitle track (found ${kinds}).`
    };
  }

  const english = text.find(({ stream }) => /^(en|eng)/i.test(stream.tags?.language ?? ""));
  const chosen = english ?? text[0];
  return {
    available: true,
    ordinal: chosen.ordinal,
    codec: chosen.stream.codec_name,
    language: chosen.stream.tags?.language ?? "",
    title: chosen.stream.tags?.title ?? ""
  };
}

function parseSrt(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, "").split("\n\n")) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    if (lines.length < 2) continue;
    const timing = lines.find((line) => line.includes("-->"));
    if (!timing) continue;
    const [from, to] = timing.split("-->").map((part) => part.trim());
    const seconds = (stamp) => {
      const match = stamp.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
      if (!match) return null;
      const [, h, m, s, ms] = match;
      return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    };
    const start = seconds(from);
    const end = seconds(to);
    if (start === null || end === null) continue;

    const body = lines
      .slice(lines.indexOf(timing) + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")          // html-ish tags
      .replace(/\{\\[^}]*\}/g, "")      // ass override blocks
      .replace(/\s+/g, " ")
      .trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues;
}

/** Extract the track once and keep the parsed cues beside the clips. */
export async function cuesFor(mediaPath, options, known) {
  const track = known ?? (await subtitleTrack(mediaPath, options));
  if (!track.available) return track;

  ensureDirs();
  await fs.mkdir(cacheDir(), { recursive: true });

  const stamp = (() => {
    try {
      const stat = statSync(mediaPath);
      return `${stat.size}:${Math.round(stat.mtimeMs)}`;
    } catch {
      return "0";
    }
  })();
  const key = createHash("sha1")
    .update(`${mediaPath}|${stamp}|${track.sidecar ?? track.ordinal}`)
    .digest("hex")
    .slice(0, 16);
  const cachePath = path.join(cacheDir(), `${key}.json`);

  try {
    return { ...track, cues: JSON.parse(await fs.readFile(cachePath, "utf8")) };
  } catch {
    // Not extracted yet.
  }

  let srt;
  if (track.sidecar) {
    try {
      srt = /\.srt$/i.test(track.sidecar)
        ? await fs.readFile(track.sidecar, "utf8")
        : (await run("ffmpeg", ["-nostdin", "-v", "error", "-i", track.sidecar, "-f", "srt", "-"], options)).stdout;
    } catch (error) {
      throw new ClipError(`Could not read ${path.basename(track.sidecar)}: ${error.message}`);
    }
    const cues = parseSrt(srt);
    try {
      await fs.writeFile(cachePath, JSON.stringify(cues));
    } catch {
      // Cache is optional.
    }
    return { ...track, cues };
  }

  try {
    // Copy the text out; no decoding or re-encoding of the video involved.
    ({ stdout: srt } = await run("ffmpeg", [
      "-nostdin", "-v", "error",
      "-i", mediaPath,
      "-map", `0:s:${track.ordinal}`,
      "-f", "srt", "-"
    ], options));
  } catch (error) {
    throw new ClipError(`Could not read the subtitles: ${error.message}`);
  }

  const cues = parseSrt(srt);
  try {
    await fs.writeFile(cachePath, JSON.stringify(cues));
  } catch {
    // The cache is an optimisation, not a requirement.
  }
  return { ...track, cues };
}

export async function searchDialogue(requestedPath, query, limit = 60) {
  const mediaPath = resolveMediaPath(requestedPath);
  const found = await cuesFor(mediaPath);
  if (!found.available) return found;

  const needle = (query ?? "").trim().toLowerCase();
  const cues = found.cues ?? [];
  if (!needle) {
    return { available: true, language: found.language, total: cues.length, results: [] };
  }

  const results = [];
  for (const cue of cues) {
    if (!cue.text.toLowerCase().includes(needle)) continue;
    results.push({
      start: cue.start,
      end: cue.end,
      startStr: secondsToTime(cue.start),
      text: cue.text
    });
    if (results.length >= limit) break;
  }
  return { available: true, language: found.language, total: cues.length, results };
}
