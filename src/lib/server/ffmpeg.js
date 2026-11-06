import { spawn } from "node:child_process";
import { ClipError } from "./errors.js";

const lastLine = (text) => {
  const lines = text.trim().split("\n").filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
};

/**
 * Run a binary with an argument list — never a shell string. Media paths are
 * full of spaces, apostrophes and parentheses, all of which a shell would
 * split or interpret.
 */
export function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => reject(new ClipError(`${bin} could not run: ${error.message}`)));
    child.on("close", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new ClipError(lastLine(stderr) || `${bin} exited with ${code}`))
    );
  });
}

/** Run ffmpeg, reporting completion between 0 and 1 as it goes. */
export function runWithProgress(args, { totalSeconds = 0, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [...args, "-progress", "pipe:1", "-nostats"]);
    let stderr = "";
    let buffer = "";

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const [key, value] = line.split("=");
        if (key === "out_time_us" && totalSeconds > 0 && onProgress) {
          const done = Number(value) / 1_000_000;
          if (Number.isFinite(done)) onProgress(Math.min(1, Math.max(0, done / totalSeconds)));
        }
      }
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => reject(new ClipError(`ffmpeg could not run: ${error.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new ClipError(lastLine(stderr) || `ffmpeg exited with ${code}`))
    );
  });
}

export async function probe(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file
  ]);
  return JSON.parse(stdout);
}

export async function durationOf(file) {
  const info = await probe(file);
  return Number(info?.format?.duration ?? 0);
}

/** Frame rate of the first video stream, for snapshot frame counts. */
export async function frameRateOf(file) {
  const info = await probe(file);
  const video = (info.streams ?? []).find((stream) => stream.codec_type === "video");
  const [num, den] = String(video?.r_frame_rate ?? "24/1").split("/").map(Number);
  const fps = den ? num / den : Number(num);
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 24;
}

/** Like run(), but collects stdout as binary. */
export function runBinary(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => reject(new ClipError(`${bin} could not run: ${error.message}`)));
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new ClipError(lastLine(stderr) || `${bin} exited with ${code}`))
    );
  });
}

/**
 * A single frame as JPEG. -ss goes before -i so ffmpeg seeks by index rather
 * than decoding up to the timestamp, which keeps this fast even on a long
 * file, and works whatever the container or codec is.
 */
export function frameAt(file, seconds, width = 480) {
  return runBinary("ffmpeg", [
    "-nostdin",
    "-ss", String(Math.max(0, seconds)),
    "-i", file,
    "-frames:v", "1",
    "-vf", `scale=${width}:-1`,
    "-f", "image2",
    "-c:v", "mjpeg",
    "-q:v", "4",
    "pipe:1"
  ]);
}
