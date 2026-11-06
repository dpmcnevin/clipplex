import { json } from "@sveltejs/kit";
import { subtitleTrack } from "$lib/server/subtitles.js";
import { searchDialogue } from "$lib/server/subtitles.js";
import { resolveMediaPath } from "$lib/server/paths.js";
import { fail } from "$lib/server/respond.js";

export async function GET({ url }) {
  const requested = url.searchParams.get("path") ?? "";
  const query = url.searchParams.get("q");

  try {
    // Without a query this is just "can this file be searched at all?", which
    // is a probe rather than a full extraction.
    if (query === null) {
      const track = await subtitleTrack(resolveMediaPath(requested));
      return json(track);
    }
    return json(await searchDialogue(requested, query));
  } catch (error) {
    return fail(error);
  }
}
