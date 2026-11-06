import { listSnapshots } from "$lib/server/clips.js";
import { PLEX_USERNAME, hasPlex } from "$lib/server/config.js";

export async function load() {
  return {
    images: await listSnapshots(),
    hasPlex: hasPlex(),
    defaultUsername: PLEX_USERNAME
  };
}
