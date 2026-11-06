import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { error } from "@sveltejs/kit";
import { resolveClipPath } from "$lib/server/paths.js";

const CONTENT_TYPES = {
  ".mp4": "video/mp4",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};

/**
 * Serve a stored clip. Honours Range requests: without them a browser cannot
 * seek within a video, and some will not play it at all.
 */
export function GET({ params, request, setHeaders }) {
  let full;
  try {
    full = resolveClipPath(params.file);
  } catch {
    throw error(403, "Not allowed.");
  }

  const type = CONTENT_TYPES[path.extname(full).toLowerCase()];
  if (!type) throw error(404, "Not found.");

  let stat;
  try {
    stat = statSync(full);
  } catch {
    throw error(404, "Not found.");
  }
  if (!stat.isFile()) throw error(404, "Not found.");

  setHeaders({ "accept-ranges": "bytes" });

  const range = request.headers.get("range");
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (match) {
    const [, rawStart, rawEnd] = match;
    let start = rawStart ? Number(rawStart) : 0;
    let end = rawEnd ? Number(rawEnd) : stat.size - 1;

    if (!rawStart && rawEnd) {
      // "bytes=-500" means the last 500 bytes.
      start = Math.max(0, stat.size - Number(rawEnd));
      end = stat.size - 1;
    }
    if (start > end || start >= stat.size) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${stat.size}` }
      });
    }
    end = Math.min(end, stat.size - 1);

    return new Response(Readable.toWeb(createReadStream(full, { start, end })), {
      status: 206,
      headers: {
        "content-type": type,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${stat.size}`
      }
    });
  }

  return new Response(Readable.toWeb(createReadStream(full)), {
    headers: { "content-type": type, "content-length": String(stat.size) }
  });
}
