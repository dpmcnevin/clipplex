import { json } from "@sveltejs/kit";
import { indexStatus, searchLibrary, startIndex, stopIndex } from "$lib/server/library-index.js";
import { fail } from "$lib/server/respond.js";

export async function GET({ url }) {
  try {
    const query = url.searchParams.get("q");
    if (query === null) return json(indexStatus());
    return json({ ...(await searchLibrary(query)), index: indexStatus() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST({ url }) {
  try {
    if (url.searchParams.get("stop") === "1") return json(stopIndex());
    return json(await startIndex({ rebuild: url.searchParams.get("rebuild") === "1" }));
  } catch (error) {
    return fail(error);
  }
}
