import { json } from "@sveltejs/kit";
import { currentStream } from "$lib/server/plex.js";
import { takeSnapshot } from "$lib/server/clips.js";
import { resolveMediaPath } from "$lib/server/paths.js";
import { fail } from "$lib/server/respond.js";

export async function POST({ url }) {
  try {
    const username = url.searchParams.get("username") ?? "";
    const stream = await currentStream(username);
    if (!stream) {
      return json({ message: `No session running for user ${username}` }, { status: 400 });
    }
    const frames = await takeSnapshot(resolveMediaPath(stream.path), stream.currentTime);
    return json({ result: "success", frames });
  } catch (error) {
    return fail(error);
  }
}
