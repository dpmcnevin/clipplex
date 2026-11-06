import { asFailure } from "$lib/server/errors.js";
import { makePreview, sourceFrom } from "$lib/server/clips.js";
import { toWebPath } from "$lib/server/paths.js";
import { clipDuration, normaliseTime } from "$lib/server/time.js";

/** Same NDJSON progress protocol as /api/clips. */
export async function POST({ url }) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch {
          // Client gone.
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

        send({ stage: "preview", progress: 0 });
        const output = await makePreview({
          source,
          start,
          duration,
          onProgress: (progress) => send({ stage: "preview", progress })
        });

        send({ result: "success", previewPath: toWebPath(output) });
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
