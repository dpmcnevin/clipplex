import fs from "node:fs/promises";
import path from "node:path";
import { STREAMABLE_LOGIN, STREAMABLE_PASSWORD } from "./config.js";
import { StreamableError } from "./errors.js";
import { resolveClipPath } from "./paths.js";
import { metadataFor } from "./clips.js";

/**
 * Streamable titles a video after the uploaded filename, so build that from
 * the clip's metadata rather than its stored name.
 */
export async function uploadName(clipPath) {
  const meta = await metadataFor(clipPath);
  let name;
  if (meta.show && meta.season && meta.episode) {
    name = `${meta.show} - S${meta.season}E${meta.episode} - ${meta.title}`;
  } else if (meta.show) {
    name = `${meta.show} - ${meta.title}`;
  } else {
    name = meta.title ?? "";
  }
  name = name.replace(/^[\s-]+|[\s-]+$/g, "");
  if (!name) {
    const stem = path.basename(clipPath, ".mp4");
    name = stem.split("_").slice(1).join("_").replace(/_\d{9,}$/, "") || stem;
  }
  return `${name}.mp4`;
}

export async function uploadToStreamable(relativePath) {
  if (!STREAMABLE_LOGIN || !STREAMABLE_PASSWORD) {
    throw new StreamableError(
      "Streamable credentials are not configured. Set STREAMABLE_LOGIN and STREAMABLE_PASSWORD."
    );
  }
  const full = resolveClipPath(relativePath);

  let body;
  try {
    const buffer = await fs.readFile(full);
    const form = new FormData();
    form.append("file", new Blob([buffer]), await uploadName(full));
    body = form;
  } catch (error) {
    throw new StreamableError(`Could not read ${path.basename(full)}: ${error.message}`);
  }

  const auth = Buffer.from(`${STREAMABLE_LOGIN}:${STREAMABLE_PASSWORD}`).toString("base64");
  let response;
  try {
    response = await fetch("https://api.streamable.com/upload", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
      body,
      signal: AbortSignal.timeout(600_000)
    });
  } catch (error) {
    throw new StreamableError(`Could not reach Streamable: ${error.message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new StreamableError(
      `Streamable returned HTTP ${response.status}: ${text.trim().slice(0, 200) || "no response body"}`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new StreamableError("Streamable returned a response that was not JSON.");
  }
}
