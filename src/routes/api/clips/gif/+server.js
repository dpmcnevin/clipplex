import { json } from "@sveltejs/kit";
import { makeGif } from "$lib/server/clips.js";
import { resolveClipPath, toWebPath } from "$lib/server/paths.js";
import { fail } from "$lib/server/respond.js";

export async function POST({ url }) {
  try {
    const clip = resolveClipPath(url.searchParams.get("file_path") ?? "");
    const width = Number(url.searchParams.get("width") ?? 480);
    const fps = Number(url.searchParams.get("fps") ?? 15);
    if (!Number.isFinite(width) || !Number.isFinite(fps)) {
      return json({ message: "Width and fps must be numbers." }, { status: 400 });
    }
    return json({ gifPath: toWebPath(await makeGif(clip, { width, fps })) });
  } catch (error) {
    return fail(error);
  }
}
