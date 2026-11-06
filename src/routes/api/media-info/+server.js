import { json } from "@sveltejs/kit";
import { mediaInfo } from "$lib/server/media.js";
import { fail } from "$lib/server/respond.js";

export async function GET({ url }) {
  try {
    return json(await mediaInfo(url.searchParams.get("path") ?? ""));
  } catch (error) {
    return fail(error);
  }
}
