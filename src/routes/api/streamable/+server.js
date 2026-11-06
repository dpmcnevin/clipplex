import { json } from "@sveltejs/kit";
import { uploadToStreamable } from "$lib/server/streamable.js";
import { fail } from "$lib/server/respond.js";

export async function POST({ url }) {
  try {
    return json(await uploadToStreamable(url.searchParams.get("file_path") ?? ""));
  } catch (error) {
    return fail(error);
  }
}
