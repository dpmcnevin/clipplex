import { json } from "@sveltejs/kit";
import { asFailure } from "./errors.js";

export function fail(error) {
  const { status, message } = asFailure(error);
  return json({ message }, { status });
}
