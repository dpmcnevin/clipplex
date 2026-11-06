import { json } from "@sveltejs/kit";
import { browse } from "$lib/server/media.js";
import { fail } from "$lib/server/respond.js";

export async function GET({ url }) {
  try {
    return json(await browse(url.searchParams.get("path") ?? ""));
  } catch (error) {
    return fail(error);
  }
}
