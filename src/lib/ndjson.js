/**
 * Read a newline-delimited JSON job stream: progress objects while the job
 * runs, then one final object. Throws if the job reported a failure or the
 * connection ended without a result.
 */
export async function streamJob(url, onProgress) {
  const response = await fetch(url, { method: "POST" });
  if (!response.body) throw new Error(`HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const update = JSON.parse(line);
      if (typeof update.progress === "number") onProgress?.(update);
      else final = update;
    }
  }

  if (!final) throw new Error("The server closed the connection early.");
  if (final.message) throw new Error(final.message);
  return final;
}
