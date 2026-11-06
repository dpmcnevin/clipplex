import { json } from "@sveltejs/kit";
import { search } from "$lib/server/plex.js";
import { fail } from "$lib/server/respond.js";

export async function GET({ url }) {
  try {
    return json({ results: await search(url.searchParams.get("query") ?? "") });
  } catch (error) {
    return fail(error);
  }
}
