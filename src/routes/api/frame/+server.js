import { frameAt } from "$lib/server/ffmpeg.js";
import { resolveMediaPath } from "$lib/server/paths.js";
import { fail } from "$lib/server/respond.js";

export async function GET({ url }) {
  try {
    const full = resolveMediaPath(url.searchParams.get("path") ?? "");
    const seconds = Number(url.searchParams.get("t") ?? 0);
    const width = Math.min(960, Math.max(80, Number(url.searchParams.get("w") ?? 480)));
    if (!Number.isFinite(seconds) || !Number.isFinite(width)) {
      return fail(Object.assign(new Error("t and w must be numbers."), { status: 400 }));
    }

    const jpeg = await frameAt(full, seconds, Math.round(width));
    return new Response(jpeg, {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(jpeg.length),
        // The same frame of the same file never changes, so let the browser
        // keep it while the user drags back and forth.
        "cache-control": "public, max-age=3600"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
