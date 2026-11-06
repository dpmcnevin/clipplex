import { json } from "@sveltejs/kit";
import { currentStream } from "$lib/server/plex.js";
import { fail } from "$lib/server/respond.js";

export async function GET({ url }) {
  const username = url.searchParams.get("username") ?? "";
  try {
    const stream = await currentStream(username);
    if (!stream) return json({ message: `No session running for user ${username}` });
    return json(stream);
  } catch (error) {
    return fail(error);
  }
}
