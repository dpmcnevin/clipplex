import { asFailure } from "$lib/server/errors.js";
import { cutClip, makeGif, sourceFrom } from "$lib/server/clips.js";
import { toWebPath } from "$lib/server/paths.js";
import { clipDuration, normaliseTime } from "$lib/server/time.js";

/**
 * Streams newline-delimited JSON while ffmpeg runs: progress objects as the
 * cut proceeds, then one final object with the result or an error. A plain
 * JSON response would leave the user staring at a spinner for the length of
 * the clip with nothing to look at.
 */
export async function POST({ url }) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch {
          // The client went away mid-cut; ffmpeg still finishes.
        }
      };

      try {
        const start = normaliseTime(url.searchParams.get("start"));
        const end = normaliseTime(url.searchParams.get("end"));
        const duration = clipDuration(start, end);

        const source = await sourceFrom({
          kind: url.searchParams.get("source") ?? "plex",
          username: url.searchParams.get("username") ?? "",
          ratingKey: url.searchParams.get("rating_key") ?? "",
          filePath: url.searchParams.get("path") ?? ""
        });

        send({ stage: "clip", progress: 0 });
        const output = await cutClip({
          source,
          start,
          duration,
          onProgress: (progress) => send({ stage: "clip", progress })
        });

        let gifPath = "";
        if (url.searchParams.get("gif") === "1") {
          send({ stage: "gif", progress: 0 });
          gifPath = toWebPath(
            await makeGif(output, { onProgress: (progress) => send({ stage: "gif", progress }) })
          );
        }

        send({ result: "success", filePath: toWebPath(output), gifPath });
      } catch (error) {
        send({ message: asFailure(error).message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" }
  });
}
