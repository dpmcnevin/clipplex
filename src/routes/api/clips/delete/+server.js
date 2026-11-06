import { json } from "@sveltejs/kit";
import { deleteClip } from "$lib/server/clips.js";
import { fail } from "$lib/server/respond.js";

export async function POST({ url }) {
  try {
    await deleteClip(url.searchParams.get("file_path") ?? "");
    return json({ result: "deleted" });
  } catch (error) {
    return fail(error);
  }
}
